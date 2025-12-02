from playwright.sync_api import sync_playwright

def verify_style(page):
    # Mock API responses to allow frontend to render
    page.route('/api/status', lambda route: route.fulfill(json={'state': {}, 'config': {'adc': {}, 'sensors': {}}}))
    page.route('/api/data', lambda route: route.fulfill(json={'state': {}, 'timestamp': 0}))

    # 1. Sensors Screen
    print('Navigating to Sensors...')
    page.goto('http://localhost:3000')
    # Click 'Sensors' in navigation (assuming text content)
    page.get_by_text('SENSORS').click()
    page.wait_for_timeout(500) # Wait for render
    page.screenshot(path='verification/sensors_cards.png')
    print('Captured sensors_cards.png')

    # 2. Motor Screen
    print('Navigating to Motor...')
    page.get_by_text('MOTOR').click()
    page.wait_for_timeout(500)
    page.screenshot(path='verification/motor_cards.png')
    print('Captured motor_cards.png')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
        verify_style(page)
    except Exception as e:
        print(f'Error: {e}')
    finally:
        browser.close()
