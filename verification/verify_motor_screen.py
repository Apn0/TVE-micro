from playwright.sync_api import sync_playwright

def verify_motor_screen():
    print("Starting verification...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Assumption: User has started backend (port 5000) and frontend (port 3000)
        # If running locally, adjust URL as needed.
        url = "http://localhost:3000"

        try:
            print(f"Navigating to {url}")
            page.goto(url)

            # Click 'Motor' tab in navigation
            # Depending on Nav implementation, it might be a button or text
            print("Clicking Motor tab...")
            page.get_by_text("Motor", exact=True).click()

            # Wait for animation/load
            page.wait_for_timeout(1000)

            # Take screenshot of the new Schematic Layout
            page.screenshot(path="verification_motor_screen_overview.png")
            print("Saved verification_motor_screen_overview.png")

            # Interact: Click 'Main screw' card to expand
            print("Expanding Main Screw card...")
            # We look for the text "Main screw" inside a metric card
            page.get_by_text("Main screw", exact=True).first.click()

            page.wait_for_timeout(500)
            page.screenshot(path="verification_motor_screen_expanded.png")
            print("Saved verification_motor_screen_expanded.png")

        except Exception as e:
            print(f"Verification failed: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_motor_screen()
