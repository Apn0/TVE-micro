#!/usr/bin/env python3
import tkinter as tk
from tkinter import ttk, messagebox
import subprocess
import os
import time
import threading

# Service Constants
SERVICE_NAME = "intarema.service"
NGINX_SERVICE = "nginx.service"
BACKEND_SCRIPT = "app.py"

class ServerManagerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("INTAREMA TVEmicro Server Manager")
        self.root.geometry("450x450")

        # Style
        style = ttk.Style()
        style.theme_use('clam')

        # Header
        header_frame = ttk.Frame(root, padding=10)
        header_frame.pack(fill=tk.X)
        ttk.Label(header_frame, text="INTAREMA Manager", font=("Helvetica", 16, "bold")).pack()

        # Status Frame
        self.status_frame = ttk.LabelFrame(root, text="Current Status", padding=10)
        self.status_frame.pack(fill=tk.X, padx=10, pady=5)

        self.lbl_backend_status = ttk.Label(self.status_frame, text="Backend: Checking...", font=("Helvetica", 12))
        self.lbl_backend_status.pack(anchor="w")

        self.lbl_nginx_status = ttk.Label(self.status_frame, text="Frontend (Nginx): Checking...", font=("Helvetica", 12))
        self.lbl_nginx_status.pack(anchor="w")

        self.lbl_proc_count = ttk.Label(self.status_frame, text="Backend Processes: 0", font=("Helvetica", 10))
        self.lbl_proc_count.pack(anchor="w", pady=(5,0))

        # Controls Frame
        self.controls_frame = ttk.LabelFrame(root, text="Controls", padding=10)
        self.controls_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        # Buttons
        btn_frame = ttk.Frame(self.controls_frame)
        btn_frame.pack(fill=tk.X, pady=5)

        ttk.Button(btn_frame, text="Start Servers", command=self.start_servers).pack(fill=tk.X, pady=2)
        ttk.Button(btn_frame, text="Stop Servers", command=self.stop_servers).pack(fill=tk.X, pady=2)
        ttk.Button(btn_frame, text="Restart Servers", command=self.restart_servers).pack(fill=tk.X, pady=2)

        # Advanced
        adv_frame = ttk.LabelFrame(root, text="Advanced / Maintenance", padding=10)
        adv_frame.pack(fill=tk.X, padx=10, pady=5)

        ttk.Button(adv_frame, text="Force Kill Duplicate Processes", command=self.clean_processes_action).pack(fill=tk.X, pady=2)

        # Auto-Restart (Service Enable)
        self.autostart_var = tk.BooleanVar()
        self.chk_autostart = ttk.Checkbutton(adv_frame, text="Auto-restart after reboot (Service Enabled)",
                                             variable=self.autostart_var, command=self.toggle_autostart)
        self.chk_autostart.pack(anchor="w", pady=5)

        # Initial checks
        self.update_status()
        self.schedule_status_loop()
        self.check_autostart_initial()

    def run_command(self, cmd):
        try:
            return subprocess.check_output(cmd, stderr=subprocess.STDOUT).decode().strip()
        except subprocess.CalledProcessError:
            return None

    def check_service_active(self, service):
        # returns True if active
        try:
            subprocess.check_call(["systemctl", "is-active", "--quiet", service])
            return True
        except subprocess.CalledProcessError:
            return False

    def check_service_enabled(self, service):
        try:
            subprocess.check_call(["systemctl", "is-enabled", "--quiet", service])
            return True
        except subprocess.CalledProcessError:
            return False

    def get_backend_process_count(self):
        try:
            # We use a pattern matching python running app.py
            output = subprocess.check_output(["pgrep", "-f", f"python.*{BACKEND_SCRIPT}"])
            lines = output.strip().splitlines()
            return len(lines)
        except subprocess.CalledProcessError:
            return 0

    def update_status(self):
        # Single update of the UI
        backend_active = self.check_service_active(SERVICE_NAME)
        if backend_active:
            self.lbl_backend_status.config(text="Backend Service: RUNNING", foreground="green")
        else:
            self.lbl_backend_status.config(text="Backend Service: STOPPED", foreground="red")

        # Check nginx
        nginx_active = self.check_service_active(NGINX_SERVICE)
        if nginx_active:
            self.lbl_nginx_status.config(text="Frontend (Nginx): RUNNING", foreground="green")
        else:
            self.lbl_nginx_status.config(text="Frontend (Nginx): STOPPED", foreground="red")

        # Check process count
        count = self.get_backend_process_count()
        self.lbl_proc_count.config(text=f"Backend Processes Detected: {count}")
        if count > 1 and backend_active:
             self.lbl_proc_count.config(foreground="orange")
        elif count > 0 and not backend_active:
             self.lbl_proc_count.config(foreground="orange") # Running manually?
        else:
             self.lbl_proc_count.config(foreground="black")

    def schedule_status_loop(self):
        self.update_status()
        self.root.after(2000, self.schedule_status_loop)

    def check_autostart_initial(self):
        is_enabled = self.check_service_enabled(SERVICE_NAME)
        self.autostart_var.set(is_enabled)

    def toggle_autostart(self):
        if self.autostart_var.get():
            subprocess.run(["sudo", "systemctl", "enable", SERVICE_NAME])
        else:
            subprocess.run(["sudo", "systemctl", "disable", SERVICE_NAME])

    def clean_processes(self):
        # Internal clean logic
        # 1. Stop service
        subprocess.run(["sudo", "systemctl", "stop", SERVICE_NAME], stderr=subprocess.DEVNULL)
        # 2. Kill all python app.py - using safer pattern
        # This will match "python3 app.py", "python app.py", etc.
        # But assumes "app.py" is in the command line.
        subprocess.run(["sudo", "pkill", "-f", f"python.*{BACKEND_SCRIPT}"], stderr=subprocess.DEVNULL)

    def clean_processes_action(self):
        if messagebox.askyesno("Confirm", "This will stop the service and kill all 'app.py' processes. Continue?"):
            self.clean_processes()
            messagebox.showinfo("Done", "Processes killed.")
            self.update_status()

    def start_servers(self):
        # Logic: Clean duplicates first, then start service.
        self.clean_processes()

        # Start Backend
        subprocess.run(["sudo", "systemctl", "start", SERVICE_NAME])
        # Start Nginx (ensure it's up)
        subprocess.run(["sudo", "systemctl", "start", NGINX_SERVICE])

        # Immediate update
        self.root.after(500, self.update_status)

    def stop_servers(self):
        subprocess.run(["sudo", "systemctl", "stop", SERVICE_NAME])
        # We generally don't stop Nginx as it might serve other things, but if requested:
        # The user said "stop server", usually implies the application.
        pass
        # Immediate update
        self.root.after(500, self.update_status)

    def restart_servers(self):
        self.clean_processes()
        subprocess.run(["sudo", "systemctl", "start", SERVICE_NAME])
        subprocess.run(["sudo", "systemctl", "restart", NGINX_SERVICE])
        self.root.after(500, self.update_status)

if __name__ == "__main__":
    root = tk.Tk()
    app = ServerManagerApp(root)
    root.mainloop()
