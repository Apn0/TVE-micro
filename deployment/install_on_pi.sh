#!/bin/bash
echo "--- INTAREMA INSTALLER ---"
sudo apt-get update && sudo apt-get install -y python3-pip nodejs npm git nginx
cd ../backend
pip3 install -r requirements.txt --break-system-packages
cd ../frontend
npm install
npm run build
sudo cp ../deployment/intarema.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable intarema.service
sudo systemctl restart intarema.service

echo "Configuring Nginx..."
sudo cp ../deployment/nginx_intarema.conf /etc/nginx/sites-available/intarema
sudo ln -sf /etc/nginx/sites-available/intarema /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl restart nginx

echo "Installation Complete. Backend and Nginx are running."
