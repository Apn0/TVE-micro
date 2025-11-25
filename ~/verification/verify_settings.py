
from playwright.sync_api import sync_playwright, expect

def verify_settings_tab(page):
    # Navigate to the home page
    page.goto("http://localhost:3000")

    # Wait for the app to load
    page.wait_for_selector("text=Mini Hackstruder HMI")

    # Click on the Settings tab
    page.click("text=SETTINGS")

    # Wait for the Settings screen to load
    # Look for "DM556 driver config" which is unique to SettingsScreen.jsx
    expect(page.get_by_text("DM556 driver config")).to_be_visible()

    # Take a screenshot
    page.screenshot(path="/home/jules/verification/settings_tab.png")
    print("Screenshot saved to /home/jules/verification/settings_tab.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_settings_tab(page)
        except Exception as e:
            print(f"Error: {e}")
            # Take a screenshot on error too
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
