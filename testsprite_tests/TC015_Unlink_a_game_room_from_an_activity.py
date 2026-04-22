import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> Navigate to http://localhost:3000
        await page.goto("http://localhost:3000")
        
        # -> Open the admin login by clicking the 'Admin' button on the homepage.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div[4]/div/a[2]/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Navigate to /admin/login and observe the login form fields (username and password).
        await page.goto("http://localhost:3000/admin/login")
        
        # -> Fill the username and password fields and submit the admin login form.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div[2]/div[2]/form/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/div[2]/div[2]/form/div[2]/input').nth(0)
        await asyncio.sleep(3); await elem.fill('admin123')
        
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div[2]/div[2]/form/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Click the navigation link to open the Activities page.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/aside/nav/a[2]').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Open the 'Add activity' form so I can create an activity (or find setup options) to proceed with linking/unlinking a game room.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/main/div/div/div/div[2]/button[2]').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Fill the activity form (set date/time and description) and submit it to create a new activity so we can later link/unlink a game room.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('2026-05-01T18:00')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[2]/div[2]/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Test activity for unlinking game room')
        
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[4]/button[2]').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Open the Add Activity form again and observe all visible form fields so I can create a new activity (date/time, location/room selection, price, description, and any game-room link controls).
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/main/div/div/div/div[2]/button[2]').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Fill the Add Activity form (datetime, price, description) and submit it to create a new activity, then wait for the activities list to update.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('2026-05-01T18:00')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('10')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[2]/div[2]/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Test activity for unlinking game room')
        
        # -> Click the 'إضافة النشاط' (Add Activity) submit button to create the activity, then observe the activities list and open the created activity's details to find link/unlink controls.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[4]/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Click the '🔓 فك الربط' (Unlink) button for the linked game room to start the unlink flow, then wait for any confirmation dialog to appear.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/div/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # --> Assertions to verify final state
        frame = context.pages[-1]
        assert await frame.locator("xpath=//*[contains(., 'Link game room')]").nth(0).is_visible(), "The activity should show a Link game room control after unlinking the linked game room"
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    