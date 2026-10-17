#!/usr/bin/env bash
# Download the face models that are too large to commit (OpenCV Zoo, Apache-2.0). Idempotent.
set -euo pipefail
D="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backend/app/integrity/models"
mkdir -p "$D"
get() { [ -s "$D/$1" ] || curl -sfL -o "$D/$1" "$2"; }
get face_detection_yunet_2023mar.onnx https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
get face_recognition_sface_2021dec.onnx https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx
echo "models ready in $D"
