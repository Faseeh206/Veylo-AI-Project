import os
import json
import uuid
import tempfile
from threading import RLock
from datetime import datetime

os.environ["KERAS_BACKEND"] = "numpy"

from flask import Flask, render_template, request, jsonify, send_from_directory
import numpy as np
from PIL import Image
import keras

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

app = Flask(
    __name__,
    template_folder=FRONTEND_DIR,
    static_folder=os.path.join(FRONTEND_DIR, "static"),
    static_url_path="/static"
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
IMG_HEIGHT = 128
IMG_WIDTH = 128
CLASS_NAMES = ["Fresh", "Slightly Aged", "Stale", "Spoiled", "Rotten"]
CLASS_DESCRIPTIONS = {
    "Fresh": "This item looks fresh and safe to consume. No visible signs of aging or spoilage.",
    "Slightly Aged": "Minor signs of aging detected. Still safe for consumption but best used soon.",
    "Stale": "Noticeable aging present. Quality has declined — consume with caution.",
    "Spoiled": "Significant spoilage detected. This item is not recommended for consumption.",
    "Rotten": "Severe decay detected. This item should be discarded immediately.",
}

UPLOAD_FOLDER = os.path.join(FRONTEND_DIR, "static", "uploads")
HISTORY_FILE = os.path.join(BASE_DIR, "history.json")
HISTORY_LOCK = RLock()

# Candidate paths for model
_CANDIDATE_PATHS = [
    os.path.join(os.path.dirname(__file__), "models", "MobileNetV2_best_model.keras"),
    os.path.join(os.path.dirname(__file__), "..", "models", "MobileNetV2_best_model.keras"),
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "Food-Freshness-Detection-Using-Deep-Learning-main",
        "Output Files",
        "agglomerative_saved_models",
        "MobileNetV2_best_model.keras",
    ),
]
MODEL_PATH = next((p for p in _CANDIDATE_PATHS if os.path.exists(p)), _CANDIDATE_PATHS[0])

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ---------------------------------------------------------------------------
# Load model at startup
# ---------------------------------------------------------------------------
print("Loading MobileNetV2 model …")
model = keras.saving.load_model(MODEL_PATH)
print("Model loaded successfully.")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def preprocess_image(image: Image.Image) -> np.ndarray:
    """Resize, normalise, and batch-dim an image for the model."""
    image = image.convert("RGB").resize((IMG_WIDTH, IMG_HEIGHT))
    img_array = np.array(image, dtype=np.float32) / 255.0
    return np.expand_dims(img_array, axis=0)


def load_history() -> list:
    with HISTORY_LOCK:
        if os.path.exists(HISTORY_FILE):
            try:
                with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (OSError, ValueError):
                return []
        return []


def save_history(history: list):
    # Replace the complete file atomically, rather than exposing a partial write.
    with HISTORY_LOCK:
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=os.path.dirname(os.path.abspath(HISTORY_FILE)), suffix=".tmp", delete=False) as f:
                temporary = f.name
                json.dump(history, f, indent=2)
            os.replace(temporary, HISTORY_FILE)
        finally:
            if temporary and os.path.exists(temporary):
                os.remove(temporary)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/predict", methods=["POST"])
def predict():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    # Save uploaded file
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        return jsonify({"error": "Unsupported file type. Please upload a JPG, PNG, or WebP image."}), 400

    unique_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_FOLDER, unique_name)
    file.save(filepath)

    # Predict
    try:
        with Image.open(filepath) as image:
            img_array = preprocess_image(image)

        # verbose=0 is essential on Windows to prevent Keras Progbar terminal
        # writes which cause [Errno 22] Invalid argument
        prediction = model.predict(img_array, verbose=0)
        probabilities = [float(p) for p in prediction[0]]
        predicted_index = int(np.argmax(probabilities))
        predicted_class = CLASS_NAMES[predicted_index]
        confidence = round(probabilities[predicted_index] * 100, 1)

        result = {
            "id": unique_name.split(".")[0],
            "filename": os.path.basename(file.filename) or "image",
            "image_url": f"/static/uploads/{unique_name}",
            "predicted_class": predicted_class,
            "confidence": confidence,
            "description": CLASS_DESCRIPTIONS[predicted_class],
            "probabilities": {
                name: round(prob * 100, 1)
                for name, prob in zip(CLASS_NAMES, probabilities)
            },
            "timestamp": datetime.now().strftime("%b %d, %Y at %I:%M %p"),
        }

        # Persist to history safely
        try:
            with HISTORY_LOCK:
                history = load_history()
                history.insert(0, result)
                save_history(history)
        except Exception as he:
            print(f"Warning: Failed to save history: {he}", flush=True)

        return jsonify(result)

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print("PREDICT ERROR TRACEBACK:\n", tb, flush=True)
        return jsonify({"error": str(e)}), 500


@app.route("/history", methods=["GET"])
def get_history():
    return jsonify(load_history())


@app.route("/history/<record_id>", methods=["DELETE"])
def delete_history_record(record_id):
    with HISTORY_LOCK:
        history = load_history()
        index = next((i for i, record in enumerate(history) if record.get("id") == record_id), None)
        if index is None:
            return jsonify({"error": "This scan record was not found."}), 404
        record = history.pop(index)
        try:
            save_history(history)
        except OSError:
            app.logger.exception("Could not save history after deleting a record")
            return jsonify({"error": "The record could not be deleted. Please try again."}), 500
        # Only remove this record's image, and never follow a path outside uploads.
        image_url = record.get("image_url", "")
        warning = None
        if image_url.startswith("/static/uploads/") and not any(r.get("image_url") == image_url for r in history):
            name = image_url[len("/static/uploads/"):]
            root = os.path.realpath(UPLOAD_FOLDER)
            image = os.path.realpath(os.path.join(root, name))
            if name and os.path.basename(name) == name and os.path.commonpath([root, image]) == root:
                try:
                    if os.path.isfile(image):
                        os.remove(image)
                except OSError:
                    app.logger.warning("Record deleted; its uploaded image could not be removed")
                    warning = "The record was deleted, but its image could not be removed from storage."
        return jsonify({"status": "ok", "deleted_id": record_id, **({"warning": warning} if warning else {})})


@app.route("/history", methods=["DELETE"])
def clear_history():
    with HISTORY_LOCK:
        save_history([])
        for f in os.listdir(UPLOAD_FOLDER):
            fpath = os.path.join(UPLOAD_FOLDER, f)
            if os.path.isfile(fpath):
                os.remove(fpath)
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)

