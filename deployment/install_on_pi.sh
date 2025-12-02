#!/bin/bash
echo "--- INTAREMA INSTALLER ---"
sudo apt-get update && sudo apt-get install -y python3-pip nodejs npm git nginx openssl
# Generate self-signed cert if missing
if [ ! -f /etc/ssl/certs/intarema-selfsigned.crt ]; then
    echo "Generating self-signed SSL certificate..."
    sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/ssl/private/intarema-selfsigned.key \
        -out /etc/ssl/certs/intarema-selfsigned.crt \
        -subj "/C=AT/ST=State/L=City/O=Intarema/OU=Engineering/CN=intarema.local"
fi

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
