import { barcodeVideo } from "./barcode-video";
import { OUT } from "./env";
import { asBarber, B, expect, hydrated, test } from "./helpers";

/**
 * The scanner with a camera. Chromium's fake camera plays a video of a real
 * EAN-13 label (barcode-video.ts), so the whole camera path runs:
 * getUserMedia, the lens, the decoder, the read, the lookup in the fake shop.
 * Desktop Chromium has no BarcodeDetector, so this is the zxing path — the
 * one every iPhone takes. Chromium only; its own file, because the camera
 * flags are launch options and Playwright takes those only at the top.
 */
const LABEL = "2000000000039"; // Beard Oil Cedar, in src/lib/shop.ts FAKE_PRODUCTS

test.skip(({ browserName }) => browserName !== "chromium", "a fake camera with a video is Chromium's");
test.use({
  ...asBarber,
  permissions: ["camera"],
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${barcodeVideo(OUT, LABEL)}`],
  },
});

test("the camera reads a label and the product is picked", async ({ page }) => {
  await page.goto("/b/sell");
  await hydrated(page);
  await page.getByRole("button", { name: B.sell.scan, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: B.sell.scanning });
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/Beard Oil Cedar/).first()).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toBeHidden();
});
