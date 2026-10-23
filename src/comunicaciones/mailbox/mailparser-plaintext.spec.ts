import { simpleParser } from 'mailparser';

describe('mailparser plaintext boundary', () => {
  it('derives plain text from an HTML-only message without exposing markup or scripts', async () => {
    const parsed = await simpleParser(
      [
        'From: requester@example.com',
        'To: support@example.com',
        'Subject: HTML only',
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        '<html><body><p>Necesito ayuda</p><script>secreto ejecutable</script></body></html>',
      ].join('\r\n'),
    );

    expect(parsed.text).toContain('Necesito ayuda');
    expect(parsed.text).not.toMatch(/<[^>]+>/);
    expect(parsed.text).not.toContain('secreto ejecutable');
  });
});
