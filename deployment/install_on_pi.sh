#!/bin/bash
echo "--- INTAREMA INSTALLER ---"
sudo apt-get update && sudo apt-get install -y python3-pip nodejs npm git
cd ../backend
pip3 install -r requirements.txt --break-system-packages
cd ../frontend
npm install
npm run build
sudo cp ../deployment/intarema.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable intarema.service
sudo systemctl restart intarema.service
echo "Backend is running."
