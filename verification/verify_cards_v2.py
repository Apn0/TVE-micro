from playwright.sync_api import sync_playwright

def verify_style(page):
    # Mock API responses to allow frontend to render
    page.route('/api/status', lambda route: route.fulfill(json={'state': {}, 'config': {'adc': {}, 'sensors': {}}}))
    page.route('/api/data', lambda route: route.fulfill(json={'state': {}, 'timestamp': 0}))

    print('Navigating to Home...')
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')

    # 1. Sensors Screen
    print('Navigating to Sensors...')
    # Force click if overlay exists (e.g. disconnect overlay)
    page.get_by_text('SENSORS').click(force=True)
    page.wait_for_timeout(1000)
    page.screenshot(path='verification/sensors_cards.png')
    print('Captured sensors_cards.png')

    # 2. Motor Screen
    print('Navigating to Motor...')
    page.get_by_text('MOTOR').click(force=True)
    page.wait_for_timeout(1000)
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
