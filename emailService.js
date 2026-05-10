const nodemailer = require('nodemailer');

/* ── TRANSPORTER ── */
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

/* ── SHARED HEADER (dark crimson + Pressfiles text, no image dependency) ── */
const LOGO_HEADER = `
  <div style="background:#8B1A1A;padding:28px 32px;border-radius:12px 12px 0 0;">
    <div style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:#fff;
                letter-spacing:-.01em;">Pressfiles</div>
    <div style="font-family:Georgia,serif;font-size:13px;color:rgba(255,255,255,.55);
                margin-top:3px;font-style:italic;">by Teacher Ira</div>
  </div>
`;

/* ── SHARED FOOTER ── */
const EMAIL_FOOTER = `
  <div style="padding:18px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#aaa;
              font-family:'Helvetica Neue',Arial,sans-serif;line-height:1.6;">
      All sales are final. This is a non-refundable digital purchase.<br/>
      Questions or concerns? Reply to this email or contact us at
      <a href="mailto:teacherira.business@gmail.com"
         style="color:#8B1A1A;text-decoration:none;font-weight:600;">
        teacherira.business@gmail.com
      </a>.
    </p>
  </div>
`;

/* ─────────────────────────────────────────
   1. NOTIFY OWNER — new order received
───────────────────────────────────────── */
async function sendOwnerNotification(order) {
  const transporter = createTransporter();

  const itemsRows = (order.items || []).map(i => `
    <tr>
      <td style="padding:11px 0;font-size:13px;color:#333;
                 font-family:'Helvetica Neue',Arial,sans-serif;
                 border-bottom:1px solid #f0e8e8;">
        ${i.title}
      </td>
      <td style="padding:11px 0;font-size:13px;color:#1a0505;font-weight:700;
                 text-align:right;font-family:Georgia,serif;
                 border-bottom:1px solid #f0e8e8;">
        ₱${Number(i.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
      </td>
    </tr>`).join('');

  const paymentDetail = order.payment?.method === 'gcash-ref'
    ? `GCash Ref: <strong style="font-family:monospace;letter-spacing:.05em;">
        ${order.payment.ref}</strong>
       &nbsp;·&nbsp; Amount Sent:
       <strong>₱${Number(order.payment.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>`
    : `Screenshot · From: <strong>${order.payment?.ssEmail || '—'}</strong>`;

  const html = `
  <!DOCTYPE html>
  <html><body style="margin:0;padding:0;background:#f5f0f0;">
  <div style="padding:32px 16px;font-family:'Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;
                overflow:hidden;box-shadow:0 2px 16px rgba(139,26,26,.10);">
      ${LOGO_HEADER}

      <!-- RED ALERT STRIP -->
      <div style="background:#a01f1f;padding:11px 32px;text-align:center;">
        <span style="color:#fff;font-size:12px;font-weight:700;letter-spacing:.08em;
                     text-transform:uppercase;font-family:'Helvetica Neue',Arial,sans-serif;">
          🛒 New Order Received — Action Required
        </span>
      </div>

      <div style="padding:28px 32px;">

        <!-- ORDER ID -->
        <p style="margin:0 0 4px;font-size:13px;color:#888;
                  font-family:'Helvetica Neue',Arial,sans-serif;">Order Reference</p>
        <p style="margin:0 0 20px;font-family:monospace;font-size:17px;font-weight:700;
                  color:#8B1A1A;letter-spacing:.06em;">${order.id}</p>

        <!-- BUYER DETAILS -->
        <div style="background:#faf6f6;border-radius:8px;padding:14px 18px;margin-bottom:16px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;
                      color:#8B1A1A;margin-bottom:10px;font-family:'Helvetica Neue',Arial,sans-serif;">
            👤 Buyer Details
          </div>
          <table style="width:100%;border-collapse:collapse;
                        font-family:'Helvetica Neue',Arial,sans-serif;">
            <tr>
              <td style="font-size:12px;color:#999;padding:3px 0;width:80px;">Name</td>
              <td style="font-size:13px;color:#1a0505;font-weight:600;">${order.fullname || '—'}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#999;padding:3px 0;">Email</td>
              <td style="font-size:13px;color:#8B1A1A;font-weight:600;">${order.email}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#999;padding:3px 0;">Address</td>
              <td style="font-size:13px;color:#555;">${order.address || '—'}</td>
            </tr>
          </table>
        </div>

        <!-- PAYMENT -->
        <div style="background:#f0f9f4;border:1px solid #c3e6cb;border-radius:8px;
                    padding:12px 18px;margin-bottom:20px;font-size:13px;color:#333;
                    font-family:'Helvetica Neue',Arial,sans-serif;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;
                      color:#1a6b3c;margin-bottom:6px;">💚 Payment</div>
          ${paymentDetail}
        </div>

        <!-- ORDER SUMMARY TABLE -->
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;
                    color:#8B1A1A;margin-bottom:10px;font-family:'Helvetica Neue',Arial,sans-serif;">
          📦 Order Summary · ${order.id}
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${itemsRows}
          <tr>
            <td style="padding:12px 0 0;font-size:12px;font-weight:700;color:#888;
                       text-transform:uppercase;letter-spacing:.08em;
                       font-family:'Helvetica Neue',Arial,sans-serif;">Total</td>
            <td style="padding:12px 0 0;font-family:Georgia,serif;font-size:20px;
                       font-weight:700;color:#8B1A1A;text-align:right;">
              ₱${Number(order.total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </td>
          </tr>
        </table>

        <!-- CTA -->
        <div style="margin-top:24px;text-align:center;">
          <a href="${process.env.SITE_URL || 'https://pressfiles.onrender.com'}/admin.html"
             style="display:inline-block;background:#8B1A1A;color:#fff;text-decoration:none;
                    border-radius:8px;padding:11px 26px;font-size:13px;font-weight:700;
                    font-family:'Helvetica Neue',Arial,sans-serif;letter-spacing:.03em;">
            → Open Admin Dashboard
          </a>
          <p style="margin:10px 0 0;font-size:12px;color:#aaa;
                    font-family:'Helvetica Neue',Arial,sans-serif;">
            Verify payment then click <strong>Send Files</strong> in the Orders tab.
          </p>
        </div>
      </div>

      ${EMAIL_FOOTER}
    </div>
  </div>
  </body></html>`;

  await transporter.sendMail({
    from: `"Pressfiles by Teacher Ira" <${process.env.EMAIL_USER}>`,
    to:   process.env.OWNER_EMAIL || process.env.EMAIL_USER,
    subject: `🛒 New Order ${order.id} — ₱${Number(order.total).toLocaleString('en-PH', { minimumFractionDigits: 2 })} from ${order.fullname || order.email}`,
    html,
  });

  console.log(`📬 Owner notified: ${order.id}`);
}

/* ─────────────────────────────────────────
   2. BUYER CONFIRMATION — please wait
   (matches Image 2 exactly)
───────────────────────────────────────── */
async function sendBuyerConfirmation(order) {
  const transporter = createTransporter();

  const firstName = (order.fullname || 'there').split(' ')[0].toUpperCase();

  const itemsRows = (order.items || []).map(i => `
    <tr>
      <td style="padding:11px 0;font-size:13px;color:#333;
                 font-family:'Helvetica Neue',Arial,sans-serif;
                 border-bottom:1px solid #ede8e8;">
        ${i.title}
      </td>
      <td style="padding:11px 0;font-size:13px;color:#333;font-weight:600;
                 text-align:right;font-family:'Helvetica Neue',Arial,sans-serif;
                 border-bottom:1px solid #ede8e8;">
        ₱${Number(i.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
      </td>
    </tr>`).join('');

  const html = `
  <!DOCTYPE html>
  <html><body style="margin:0;padding:0;background:#f5f0f0;">
  <div style="padding:32px 16px;font-family:'Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;
                overflow:hidden;box-shadow:0 2px 16px rgba(139,26,26,.10);">
      ${LOGO_HEADER}

      <div style="padding:28px 32px 8px;">

        <!-- GREETING -->
        <p style="margin:0 0 10px;font-size:18px;font-weight:700;color:#1a0505;
                  font-family:'Helvetica Neue',Arial,sans-serif;">
          Hi ${firstName}! 👋
        </p>
        <p style="margin:0 0 22px;font-size:14px;color:#555;line-height:1.65;
                  font-family:'Helvetica Neue',Arial,sans-serif;">
          We've received your order and your GCash payment is now being
          reviewed. Please hang tight — we'll send your files to this email once
          everything is verified. 🙏
        </p>

        <!-- STATUS BADGE -->
        <div style="margin-bottom:24px;">
          <div style="display:inline-block;background:#fff8e6;border:1.5px solid #f0c040;
                      border-radius:100px;padding:8px 20px;font-size:12px;font-weight:700;
                      letter-spacing:.06em;text-transform:uppercase;color:#b07800;
                      font-family:'Helvetica Neue',Arial,sans-serif;">
            ⏳ Payment Under Review
          </div>
        </div>

        <!-- ORDER SUMMARY BOX -->
        <div style="background:#faf6f6;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;
                      color:#8B1A1A;margin-bottom:14px;font-family:'Helvetica Neue',Arial,sans-serif;">
            Order Summary · ${order.id}
          </div>
          <table style="width:100%;border-collapse:collapse;">
            ${itemsRows}
            <tr>
              <td style="padding:12px 0 0;font-size:13px;font-weight:700;color:#1a0505;
                         font-family:'Helvetica Neue',Arial,sans-serif;">Total</td>
              <td style="padding:12px 0 0;font-family:Georgia,serif;font-size:20px;
                         font-weight:700;color:#8B1A1A;text-align:right;">
                ₱${Number(order.total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </table>
        </div>

        <!-- WHAT HAPPENS NEXT -->
        <div style="background:#f0f9f4;border:1px solid #c3e6cb;border-radius:10px;
                    padding:16px 20px;margin-bottom:24px;">
          <div style="font-size:12px;font-weight:700;color:#1a6b3c;margin-bottom:8px;
                      font-family:'Helvetica Neue',Arial,sans-serif;">What happens next?</div>
          <p style="margin:0;font-size:13px;color:#444;line-height:1.65;
                    font-family:'Helvetica Neue',Arial,sans-serif;">
            Once your GCash payment is verified, your digital files will be sent to this
            email within <strong>24 hours</strong>. Please check your spam or junk folder too.
          </p>
        </div>

      </div>

      ${EMAIL_FOOTER}
    </div>
  </div>
  </body></html>`;

  await transporter.sendMail({
    from:    `"Pressfiles by Teacher Ira" <${process.env.EMAIL_USER}>`,
    to:      order.email,
    subject: `✅ Order Received — ${order.id} | Pressfiles`,
    html,
  });

  console.log(`📧 Buyer confirmation sent to: ${order.email}`);
}

/* ─────────────────────────────────────────
   3. FILE DELIVERY — send download links
   (matches Image 1 exactly)
───────────────────────────────────────── */
async function sendFileDelivery(order, products) {
  const transporter = createTransporter();

  const firstName = (order.fullname || 'there').split(' ')[0].toUpperCase();

  const deliverableItems = (order.items || []).map(item => {
    const prod = products.find(p => String(p.id) === String(item.id));
    return {
      title:     item.title,
      driveLink: prod?.driveLink || item.driveLink || null,
      fileSize:  prod?.fileSize  || item.fileSize  || '',
      type:      item.type       || '',
    };
  });

  const linksHtml = deliverableItems.map(item => `
    <div style="padding:14px 0;border-bottom:1px solid #f0e8e8;
                display:table;width:100%;table-layout:fixed;">
      <div style="display:table-cell;vertical-align:middle;">
        <div style="font-size:14px;font-weight:600;color:#1a0505;margin-bottom:3px;
                    font-family:'Helvetica Neue',Arial,sans-serif;">${item.title}</div>
        <div style="font-size:12px;color:#aaa;font-family:'Helvetica Neue',Arial,sans-serif;">
          ${item.fileSize ? item.fileSize + ' · ' : ''}${item.type || 'ZIP file'}
        </div>
      </div>
      <div style="display:table-cell;vertical-align:middle;text-align:right;width:120px;">
        ${item.driveLink
          ? `<a href="${item.driveLink}"
               style="display:inline-block;background:#8B1A1A;color:#fff;text-decoration:none;
                      border-radius:6px;padding:7px 16px;font-size:12px;font-weight:700;
                      font-family:'Helvetica Neue',Arial,sans-serif;letter-spacing:.03em;">
               ↓ Download
             </a>`
          : `<span style="font-size:12px;color:#bbb;font-family:'Helvetica Neue',Arial,sans-serif;">
               Link not set
             </span>`
        }
      </div>
    </div>`).join('');

  const html = `
  <!DOCTYPE html>
  <html><body style="margin:0;padding:0;background:#f5f0f0;">
  <div style="padding:32px 16px;font-family:'Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;
                overflow:hidden;box-shadow:0 2px 16px rgba(139,26,26,.10);">
      ${LOGO_HEADER}

      <div style="padding:28px 32px 8px;">

        <!-- HEADING -->
        <p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1a0505;
                  font-family:'Helvetica Neue',Arial,sans-serif;">
          Your files are ready! 🎉
        </p>
        <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;
                  font-family:'Helvetica Neue',Arial,sans-serif;">
          Hi <strong>${firstName}</strong>, your GCash payment has been verified.
          Click the buttons below to download your files.
        </p>

        <!-- DOWNLOAD LINKS -->
        <div style="margin-bottom:24px;">
          ${linksHtml}
        </div>

        <!-- ORDER + TOTAL BOX -->
        <div style="background:#faf6f6;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
          <div style="display:table;width:100%;margin-bottom:6px;">
            <div style="display:table-cell;font-size:13px;color:#888;
                        font-family:'Helvetica Neue',Arial,sans-serif;">
              Order ID:
            </div>
            <div style="display:table-cell;text-align:right;font-family:monospace;
                        font-size:13px;font-weight:700;color:#8B1A1A;">
              ${order.id}
            </div>
          </div>
          <div style="display:table;width:100%;">
            <div style="display:table-cell;font-size:13px;color:#888;
                        font-family:'Helvetica Neue',Arial,sans-serif;">
              Total Paid:
            </div>
            <div style="display:table-cell;text-align:right;font-family:Georgia,serif;
                        font-size:16px;font-weight:700;color:#1a0505;">
              ₱${Number(order.total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <!-- REMINDER -->
        <div style="background:#fff8e6;border:1px solid #f0d080;border-radius:8px;
                    padding:12px 16px;margin-bottom:20px;font-size:12px;color:#8a6000;
                    line-height:1.6;font-family:'Helvetica Neue',Arial,sans-serif;">
          These files are for your <strong>personal use only</strong>.
          Do not share, resell, or redistribute the files.
        </div>

        <p style="margin:0 0 4px;font-size:13px;color:#888;
                  font-family:'Helvetica Neue',Arial,sans-serif;">
          Questions? Email
          <a href="mailto:teacherira.business@gmail.com"
             style="color:#8B1A1A;font-weight:600;text-decoration:none;">
            teacherira.business@gmail.com
          </a>
        </p>

      </div>

      ${EMAIL_FOOTER}
    </div>
  </div>
  </body></html>`;

  await transporter.sendMail({
    from:    `"Pressfiles by Teacher Ira" <${process.env.EMAIL_USER}>`,
    to:      order.email,
    subject: `✅ Your Pressfiles Order is Ready — ${order.id}`,
    html,
  });

  console.log(`📨 Files delivered to: ${order.email}`);
}

module.exports = {
  sendOwnerNotification,
  sendBuyerConfirmation,
  sendFileDelivery,
};