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
        
        # -> Open the Admin login by clicking the 'لوحة الإدارة (Admin)' button
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div[4]/div/a[2]/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Enter admin credentials (admin/admin123) into the login form and submit it.
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
        
        # -> Open the bookings page to create a new booking.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/aside/nav/a[3]').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Open the 'New Booking' form by clicking the '+ حجز جديد' button so the booking creation fields are visible.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/main/div/div/div/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Open the activity dropdown so its options are visible (prepare to choose an activity).
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div/select').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Select an activity from the activity dropdown (index 898) to begin creating the free booking.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[2]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Booking Free User')
        
        # -> Fill the phone number field and submit the booking by clicking 'إضافة الحجز' so the new booking can be created, then verify it appears in the bookings list with a free/unpaid status.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[2]/div[2]/input').nth(0)
        await asyncio.sleep(3); await elem.fill('0791234567')
        
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[2]/form/div[5]/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Filter/search the bookings list for 'Booking Free User' to confirm the booking is present and shows free/unpaid status.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[3]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('Booking Free User')
        
        # -> Clear the search field (index 469) so the bookings list can show all free bookings, then check whether the created booking appears with the free/unpaid indicator.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[3]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('')
        
        # -> Search the bookings list by phone number '0791234567' using the search input (index 469) to try to locate the newly created booking and confirm it shows a free/unpaid indicator.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[3]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('0791234567')
        
        # -> Clear the search field and reset the status filter to 'كل الحالات' so the bookings list shows all entries, then check for the created booking.
        frame = context.pages[-1]
        # Input text
        elem = frame.locator('xpath=/html/body/div/main/div/div/div[3]/div/input').nth(0)
        await asyncio.sleep(3); await elem.fill('')
        
        # --> Assertions to verify final state
        frame = context.pages[-1]
        assert await frame.locator("xpath=//*[contains(., 'Booking Free User')]").nth(0).is_visible(), "The bookings list should show the newly created booking after submission.",
        assert await frame.locator("xpath=//*[contains(., 'غير مدفوع')]").nth(0).is_visible(), "The booking should show an unpaid status indicator after creating a free booking."]}
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    