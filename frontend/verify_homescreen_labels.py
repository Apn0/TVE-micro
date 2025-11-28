from playwright.sync_api import sync_playwright
import sys

def verify_homescreen(page):
    print("Navigating to http://localhost:3000...")
    page.goto("http://localhost:3000")

    # Wait for the page to load
    try:
        page.wait_for_selector("text=Extruder overview", timeout=5000)
    except:
        print("Could not find 'Extruder overview'. Is the app running?")
        sys.exit(1)

    # Verify "T1:" orange label is gone.
    # The removed text format was "T1: XX.X" or "T1: --.-"
    # We check that no element contains "T1:" visible on the screen.
    # Note: The cards display "T1 barrel", so "T1:" should be unique to the removed label.
    if page.locator("text=T1:").count() > 0:
        print("FAILURE: Found 'T1:' label. It should have been removed.")
        sys.exit(1)

    if page.locator("text=T2:").count() > 0:
        print("FAILURE: Found 'T2:' label. It should have been removed.")
        sys.exit(1)

    if page.locator("text=T3:").count() > 0:
        print("FAILURE: Found 'T3:' label. It should have been removed.")
        sys.exit(1)

    # Verify MICA labels are gone
    if page.locator("text=MICA Z1").count() > 0:
        print("FAILURE: Found 'MICA Z1' label. It should have been removed.")
        sys.exit(1)

    if page.locator("text=MICA Z2").count() > 0:
        print("FAILURE: Found 'MICA Z2' label. It should have been removed.")
        sys.exit(1)

    print("SUCCESS: Orange temp labels and MICA labels are not found.")
    page.screenshot(path="homescreen_verification.png")
    print("Screenshot saved to homescreen_verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        verify_homescreen(page)
        browser.close()
