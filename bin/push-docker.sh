#!/bin/bash

# Set variables
IMAGE_NAME="biu-proxy-server"
DOCKERHUB_REPO="wikiyodo/idahosa-proxy-server"

# Build the Docker image
echo "🚀 Building Docker image..."
docker build -t $IMAGE_NAME .

# Tag the Docker image for Docker Hub
echo "🏷️ Tagging image..."
docker tag $IMAGE_NAME:latest $DOCKERHUB_REPO:latest

# Push the image to Docker Hub
echo "📤 Pushing image to Docker Hub..."
docker push $DOCKERHUB_REPO:latest

echo "✅ Deployment complete!"
