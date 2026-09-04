const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function main() {
  const context = {
    console,
    Response,
    AbortController,
    setTimeout,
    clearTimeout,
    navigator: {},
    window: {
      fetch: async () => new Response('<html>Method not allowed</html>', {
        status: 405,
        headers: { 'Content-Type': 'text/html' }
      })
    }
  };
  context.window.window = context.window;
  vm.runInNewContext(fs.readFileSync('local-ai-fallback.js', 'utf8'), context);

  const response = await context.window.fetch('/api/coach', {
    method: 'POST',
    body: JSON.stringify({
      message: 'What should I do next?',
      context: {
        workout: [{ name: 'Barbell Back Squat', prescription: '4 x 5', sets: 4 }],
        today: []
      }
    })
  });
  const output = await response.json();
  assert.equal(response.status, 200);
  assert.match(output.reply, /Barbell Back Squat/);
  assert.equal(output.model, 'Built-in adaptive coach');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
