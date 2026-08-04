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
      parts.push(
