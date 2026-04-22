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
        
        # -> Click the 'لوحة الإدارة (Admin)' button to open the admin login or admin area.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div[4]/div/a[2]/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Open the admin login page at /admin/login so I can log in as admin and continue.
        await page.goto("http://localhost:3000/admin/login")
        
        # -> Fill the admin credentials and submit the login form, then wait for the admin dashboard to load (next: navigate to Activities).
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
        
        # -> Click the '🎯 الأنشطة' (Activities) link to open the activities management page.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/main/div/div/div/div[2]/a').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Click the '+ إضافة نشاط جديد' (Add activity) button to open the new-activity form so we can create an activity to use for the booking.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/main/div/div/div/div[2]/button[2]').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Fill the new activity form (set date/time, price, description) and submit by clicking 'إضافة النشاط' to create the activity.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('2026-05-01T10:00')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('15')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[2]/div[2]/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Booking test activity for paid booking')
        
        # -> Click the 'إضافة النشاط' (Add Activity) button to submit the new activity, then wait for the Activities page to update so we can create a booking for it.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[4]/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Click the '📅 حجز جديد' (New booking) button to open the booking form for creating a paid booking.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/main/div/div/div/div[2]/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Fill the booking name field with 'Booking Test Paid' (index 1018) and continue to complete and submit the booking form.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Booking Test Paid')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[2]/div[2]/input').nth(0)
        await asyncio.sleep(3); await elem.fill('0791234567')
        
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[3]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('4')
        
        # --> Assertions to verify final state
        frame = context.pages[-1]
        assert await frame.locator("xpath=//*[contains(., 'Booking Test Paid')]").nth(0).is_visible(), "The bookings list should show Booking Test Paid after creating a paid booking."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    