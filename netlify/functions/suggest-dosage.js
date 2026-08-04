// Netlify Function — gợi ý số ngày điều trị / 1 đơn vị sản phẩm cho thuốc mạn tính, dùng Claude API.
// Đây LUÔN LÀ GỢI Ý THAM KHẢO — dược sĩ tại Upharma cần kiểm tra lại trước khi lưu, vì đóng gói/hàm lượng
// thực tế có thể khác nhau giữa các nhà sản xuất, và app không biết chính xác hàm lượng/quy cách của
// sản phẩm cụ thể đang bán tại Upharma.

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

  const { code, name } = payload;
  if (!code && !name) {
    return { statusCode: 400, body: JSON.stringify({ error: "Thiếu mã hoặc tên sản phẩm." }) };
  }

  const prompt = `Bạn hỗ trợ dược sĩ tại một chuỗi nhà thuốc (Upharma) ước tính thông tin để nhắc lịch chăm sóc khách hàng mua thuốc điều trị mạn tính (tim mạch, huyết áp, tiểu đường...).

Sản phẩm: ${name ? name : ""}${code ? ` (mã nội bộ: ${code})` : ""}

Dựa trên tên sản phẩm trên (đoán loại thuốc, hoạt chất, quy cách đóng gói phổ biến trên thị trường Việt Nam nếu nhận ra được), hãy ước tính:
- daysPerUnit: 1 đơn vị bán (hộp/vỉ/chai/lọ) thông thường đủ dùng bao nhiêu NGÀY, theo liều dùng phổ biến/khuyến cáo thường gặp cho loại thuốc này. Trả về số nguyên.
- note: mô tả ngắn gọn quy cách + liều dùng giả định (VD: "Hộp 30 viên, uống ngày 1 viên"). Nếu không chắc chắn nhận diện được thuốc từ tên, ghi rõ trong note là "không chắc chắn, dược sĩ cần xác nhận lại".

Nếu tên sản phẩm không đủ rõ để nhận diện thuốc, vẫn trả lời với ước tính hợp lý nhất có thể và daysPerUnit là số nguyên dương bất kỳ (không được null), nhưng ghi rõ độ không chắc chắn trong note.

CHỈ trả lời đúng 1 dòng JSON, không thêm chữ nào khác, không dùng markdown code block, theo đúng format:
{"daysPerUnit": <số nguyên>, "note": "<mô tả ngắn>"}`;

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
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { statusCode: resp.status, body: JSON.stringify({ error: `Anthropic API lỗi (${resp.status}): ${errText}` }) };
    }

    const data = await resp.json();
    const text = (data.content || []).map((block) => block.text || "").join("\n").trim();

    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (e) {
      return { statusCode: 502, body: JSON.stringify({ error: "AI trả lời không đúng định dạng, thử lại." }) };
    }

    const daysPerUnit = Number(parsed.daysPerUnit);
    if (!daysPerUnit || daysPerUnit <= 0) {
      return { statusCode: 502, body: JSON.stringify({ error: "AI không ước tính được số ngày, thử lại hoặc nhập tay." }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        daysPerUnit: Math.round(daysPerUnit),
        note: `[Gợi ý AI — kiểm tra lại] ${parsed.note || ""}`.trim(),
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "Lỗi không xác định khi gọi Anthropic API." }) };
  }
};
