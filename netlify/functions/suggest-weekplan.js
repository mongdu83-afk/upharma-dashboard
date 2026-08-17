// Netlify Function — gợi ý kế hoạch tuần (Nhân sự / Doanh thu / Hàng hoá / Cơ sở vật chất / Mặt bằng)
// dựa trên số liệu tổng hợp doanh thu, tồn kho, khách hàng. Dùng Claude API.
// Đây là GỢI Ý THAM KHẢO — quản lý cửa hàng cần xem lại và điều chỉnh cho đúng thực tế trước khi lưu.

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

  const { weekLabel, revenue, inventory, customers, prevPlan } = payload;

  const prompt = `Bạn hỗ trợ quản lý chuỗi nhà thuốc Upharma lập kế hoạch vận hành cho tuần tới, dựa trên số liệu tổng hợp bên dưới.

Tuần đang lập kế hoạch: ${weekLabel || "(không rõ)"}

DOANH THU:
${JSON.stringify(revenue || {}, null, 0)}

TỒN KHO (kỳ gần nhất đã tải):
${JSON.stringify(inventory || {}, null, 0)}

KHÁCH HÀNG (kỳ gần nhất đã tải):
${JSON.stringify(customers || {}, null, 0)}

${prevPlan ? `KẾ HOẠCH TUẦN TRƯỚC (để tham chiếu, không lặp lại y nguyên):\n${JSON.stringify(prevPlan, null, 0)}` : ""}

Hãy đề xuất kế hoạch tuần này, bằng tiếng Việt, ngắn gọn, dùng gạch đầu dòng, chia đúng 5 phần theo thứ tự:

1. NHÂN SỰ: đề xuất cụ thể (VD: đào tạo gì, theo dõi ai, tuyển dụng...) dựa trên tình hình chung, nếu không đủ dữ liệu thì đề xuất chung chung nhưng thiết thực.
2. DOANH THU: nhận định xu hướng doanh thu tuần trước, đề xuất mục tiêu/hành động cụ thể tuần này (mặt hàng nên đẩy mạnh, cửa hàng cần chú ý...).
3. HÀNG HOÁ: dựa trên số liệu tồn kho/cận hạn/hết hạn, đề xuất hành động cụ thể (xả hàng cận hạn, đặt hàng bổ sung, kiểm kê...).
4. CƠ SỞ VẬT CHẤT: đề xuất chung dựa trên bối cảnh vận hành chuỗi nhà thuốc (kiểm tra định kỳ, bảo trì...), nếu không có dữ liệu cụ thể thì đưa gợi ý thiết thực chung.
5. MẶT BẰNG: đề xuất chung liên quan mặt bằng cửa hàng (hạn hợp đồng, tình trạng thuê, vị trí...) nếu không có dữ liệu cụ thể thì đưa gợi ý thiết thực chung.

Mỗi phần tối đa 3-4 gạch đầu dòng, không lan man. Đây là gợi ý tham khảo để quản lý xem xét, không phải quyết định cuối cùng.`;

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
        max_tokens: 1500,
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
      body: JSON.stringify({ suggestion: text }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "Lỗi không xác định khi gọi Anthropic API." }) };
  }
};
