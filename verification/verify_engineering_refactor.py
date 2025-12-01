from playwright.sync_api import sync_playwright, expect
import time

def verify_engineering_screen():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app (assuming it's running on localhost:3000)
        page.goto("http://localhost:3000")

        # Wait for the app to load
        page.wait_for_load_state("networkidle")

        # Click on Settings to get to the button for Engineering Mode
        # Assuming there is a navigation or direct button.
        # Based on file structure, HomeScreen might be default.
        # I need to navigate to 'SETTINGS' then 'ENGINEERING'.

        # Assuming there is a sidebar or nav:
        # Check if we are on Home.

        # Try to find "Settings" in the nav
        try:
            page.get_by_text("SETTINGS").click()
        except:
            # Maybe it's an icon or different text.
            # Let's check for "Settings" or gear icon.
            # If the nav is icon based...
            pass

        # Wait a bit
        time.sleep(1)

        # On Settings screen, look for "Advanced Engineering Settings" button
        # The button text in SettingsScreen.jsx is "Advanced Engineering Settings"
        page.get_by_text("Advanced Engineering Settings").click()

        # Wait for Engineering Screen
        time.sleep(1)

        # Verify headers exist (ConfigSection titles)
        expect(page.get_by_role("heading", name="System & Logging")).to_be_visible()
        expect(page.get_by_role("heading", name="Process Cycle Logic")).to_be_visible()
        expect(page.get_by_role("heading", name="Heaters (Thermal)")).to_be_visible()

        # Verify some rows (SettingRow labels)
        expect(page.get_by_text("Data Log Interval")).to_be_visible()
        expect(page.get_by_text("Auto-Start on Power Up")).to_be_visible()
        expect(page.get_by_text("Max Heater Duty Cycle")).to_be_visible()

        # Verify Action Row
        expect(page.get_by_role("button", name="Apply System Settings")).to_be_visible()

        # Take screenshot
        page.screenshot(path="verification/engineering_screen_refactor.png")

        browser.close()

if __name__ == "__main__":
    verify_engineering_screen()
