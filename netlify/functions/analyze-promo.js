// Netlify Function — phân tích hiệu quả chương trình khuyến mại bằng Claude API.
// Key được đọc từ biến môi trường ANTHROPIC_API_KEY (cấu hình trong Netlify, KHÔNG hardcode ở đây).

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Chưa cấu hình ANTHROPIC_API_KEY trên Netlify (Site settings → Environment variables)." }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Dữ liệu gửi lên không hợp lệ." }) };
  }

  const { promoName, daysPromo, daysBase, summary, rows } = payload;
  if (!Array.isArray(rows) || rows.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "Không có dữ liệu SKU để phân tích." }) };
  }

  // Giới hạn số dòng gửi lên để tránh prompt quá dài — ưu tiên SKU doanh thu cao nhất
  const topRows = rows.slice(0, 40);
  const dataLines = topRows.map((r) => {
    const parts = [
      `${r.code}${r.name ? " (" + r.name + ")" : ""}`,
      `SL kỳ KM: ${r.qtyPromo}`,
      `DT kỳ KM: ${Math.round(r.revenuePromo).toLocaleString("vi-VN")}đ`,
    ];
    if (r.revChangePct != null) {
      parts.push(`DT kỳ so sánh: ${Math.round(r.revenueBase).toLocaleString("vi-VN")}đ`);
      parts.push(`thay đổi DT: ${r.revChangePct >= 0 ? "+" : ""}${r.revChangePct.toFixed(1)}%`);
    }
    if (r.upliftRevenue != null) {
      parts.push(`DT tăng thêm ước tính: ${Math.round(r.upliftRevenue).toLocaleString("vi-VN")}đ`);
    }
    return "- " + parts.join(", ");
  }).join("\n");

  const prompt = `Bạn là chuyên gia phân tích bán lẻ dược phẩm, hỗ trợ cho chuỗi nhà thuốc Upharma.

Dưới đây là dữ liệu hiệu quả chương trình khuyến mại${promoName ? ` "${promoName}"` : ""}:
- Kỳ khuyến mại: ${daysPromo} ngày
- Kỳ so sánh: ${daysBase ? daysBase + " ngày" : "không có (không so sánh được tăng trưởng)"}
- Tổng quan: ${JSON.stringify(summary)}

Chi tiết theo từng SKU (đơn vị tiền: VNĐ):
${dataLines}

Hãy phân tích và trả lời bằng tiếng Việt, dùng gạch đầu dòng ngắn gọn, không lan man, gồm đúng 3 phần:

1. NHẬN ĐỊNH CHUNG: chương trình này có hiệu quả không, có đáng tiếp tục/mở rộng không, vì sao.
2. SKU NÊN GIỮ / NÊN DỪNG: liệt kê cụ thể mã SKU nên tiếp tục khuyến mại và SKU nên dừng, kèm lý do 1 dòng mỗi SKU.
3. ĐỀ XUẤT CHO ĐỢT TIẾP THEO: gợi ý cụ thể về mức giảm giá, danh mục nên bổ sung/loại bỏ, thời điểm chạy chương trình.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { statusCode: resp.status, body: JSON.stringify({ error: `Anthropic API lỗi (${resp.status}): ${errText}` }) };
    }

    const data = await resp.json();
    const text = (data.content || []).map((block) => block.text || "").join("\n").trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis: text }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "Lỗi không xác định khi gọi Anthropic API." }) };
  }
};
