// Kavenegar `verify/lookup.json` responses in the shape its REST documentation shows. Contract tests replay these
// through an injected fetch: CI never calls the live API. The messages are Kavenegar's own text and must never
// reach a log or an error.

export interface RecordedResponse {
  status: number;
  body: string;
}

export const kavenegarAccepted: RecordedResponse = {
  status: 200,
  body: JSON.stringify({
    return: { status: 200, message: "تایید شد" },
    entries: [{ messageid: 8792343, status: 5, statustext: "ارسال به مخابرات", receptor: "09121234567", date: 1356619709, cost: 120 }],
  }),
};

/** Kavenegar answers an error with the same code in the HTTP status and in `return.status`. */
export const kavenegarError = (code: number): RecordedResponse => ({
  status: code,
  body: JSON.stringify({ return: { status: code, message: `خطا ${code} از سوی ارائه‌دهنده` } }),
});
