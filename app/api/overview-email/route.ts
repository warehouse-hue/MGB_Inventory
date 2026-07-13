const RESEND_API_URL = "https://api.resend.com/emails";

function toSafeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOverviewBody(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let listBuffer: string[] = [];
  let currentSectionTitle = "";
  let sectionOpen = false;

  const openSection = () => {
    if (sectionOpen) return;

    html.push(
      '<div style="margin:14px 0 0;padding:14px 14px 6px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">'
    );
    sectionOpen = true;
  };

  const closeSection = () => {
    if (!sectionOpen) return;
    html.push("</div>");
    sectionOpen = false;
  };

  const isMetricLine = (value: string) => value.includes("::");

  const renderMetricList = (items: string[]) => {
    const pairs = items
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [label, ...rest] = item.split("::");
        const value = rest.join("::").trim();
        if (!label || !value) return null;

        return {
          label: label.trim(),
          value,
        };
      })
      .filter((pair): pair is { label: string; value: string } => Boolean(pair));

    if (pairs.length === 0) return;

    const rows: string[] = [];

    for (let index = 0; index < pairs.length; index += 2) {
      const left = pairs[index];
      const right = pairs[index + 1];

      const renderCell = (pair?: { label: string; value: string }) => {
        if (!pair) {
          return '<td width="50%" style="padding:6px;"></td>';
        }

        return `<td width="50%" valign="top" style="padding:6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dbeafe;background:#eff6ff;">
            <tr>
              <td style="padding:9px 10px;">
                <p style="margin:0;color:#1d4ed8;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;font-weight:700;">${escapeHtml(
                  pair.label
                )}</p>
                <p style="margin:6px 0 0;color:#0f172a;font-size:20px;line-height:1.2;font-weight:700;">${escapeHtml(
                  pair.value
                )}</p>
              </td>
            </tr>
          </table>
        </td>`;
      };

      rows.push(`<tr>${renderCell(left)}${renderCell(right)}</tr>`);
    }

    html.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 14px;">${rows.join("")}</table>`
    );
  };

  const flushList = () => {
    if (listBuffer.length === 0) return;

    if (listBuffer.every(isMetricLine)) {
      renderMetricList(listBuffer);
      listBuffer = [];
      return;
    }

    html.push(
      `<ul style="margin:10px 0 16px;padding-left:18px;color:#334155;font-size:14px;line-height:1.6;">${listBuffer
        .map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`)
        .join("")}</ul>`
    );
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      if (sectionOpen) {
        html.push('<div style="height:4px;"></div>');
      }
      continue;
    }

    if (line.startsWith("- ")) {
      listBuffer.push(line.slice(2));
      continue;
    }

    flushList();

    if (line.startsWith("# ")) {
      closeSection();
      html.push(
        `<h1 style="margin:0 0 14px;font-size:24px;line-height:1.2;color:#0f172a;font-weight:700;">${escapeHtml(line.slice(2))}</h1>`
      );
      continue;
    }

    if (line.startsWith("## ")) {
      closeSection();
      openSection();
      currentSectionTitle = line.slice(3).trim();
      html.push(
        `<h2 style="margin:0 0 8px;font-size:13px;line-height:1.3;color:#0f172a;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(currentSectionTitle)}</h2>`
      );
      continue;
    }

    html.push(
      `<p style="margin:0 0 10px;color:#334155;font-size:14px;line-height:1.6;">${escapeHtml(line)}</p>`
    );
  }

  flushList();
  closeSection();
  return html.join("");
}

function buildHtmlFromMarkdown(markdown: string) {
  const renderedBody = renderOverviewBody(markdown);

  return `
    <div style="background:#f1f5f9;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="background:#0f172a;padding:20px 24px;color:#f8fafc;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.85;">MGB Inventory</p>
          <h2 style="margin:0;font-size:22px;line-height:1.25;font-weight:700;">Operations Overview</h2>
          <p style="margin:8px 0 0;font-size:13px;opacity:0.9;">Automated warehouse snapshot generated from live purchase and stock data.</p>
        </div>

        <div style="padding:22px 24px;">
          ${renderedBody}

          <div style="margin-top:18px;border-top:1px solid #e2e8f0;padding-top:14px;">
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">
              This email was generated automatically by MGB Inventory.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function POST(request: Request) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.OVERVIEW_EMAIL_FROM || "onboarding@resend.dev";

  if (!resendApiKey) {
    return Response.json(
      {
        error: "RESEND_API_KEY is missing. Add it to your environment variables.",
      },
      { status: 500 }
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body = (payload || {}) as {
    to?: unknown;
    overview?: unknown;
    subject?: unknown;
  };

  const to = toSafeString(body.to);
  const overview = toSafeString(body.overview);
  const subject = toSafeString(body.subject) || `Inventory Overview - ${new Date().toLocaleDateString()}`;

  if (!to || !to.includes("@")) {
    return Response.json({ error: "A valid recipient email is required." }, { status: 400 });
  }

  if (!overview) {
    return Response.json({ error: "Overview content is required." }, { status: 400 });
  }

  if (overview.length > 20000) {
    return Response.json({ error: "Overview is too large to email." }, { status: 400 });
  }

  try {
    const resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text: overview,
        html: buildHtmlFromMarkdown(overview),
      }),
    });

    const resendPayload = (await resendResponse.json().catch(() => ({}))) as { message?: string };

    if (!resendResponse.ok) {
      return Response.json(
        {
          error: resendPayload.message || "Email provider rejected the request.",
        },
        { status: resendResponse.status }
      );
    }

    return Response.json({ message: `Overview email sent to ${to}.` });
  } catch {
    return Response.json(
      {
        error: "Failed to reach email provider.",
      },
      { status: 502 }
    );
  }
}
