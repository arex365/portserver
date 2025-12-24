(function(){
  const coinInput = document.getElementById('coin');
  const tableInput = document.getElementById('tableName');
  const actionSelect = document.getElementById('action');
  const sizeInput = document.getElementById('size');
  const submitBtn = document.getElementById('submit');
  const clearBtn = document.getElementById('clear');
  const result = document.getElementById('result');

  function show(msg, isError) {
    result.textContent = msg;
    result.style.color = isError ? 'crimson' : '#222';
  }

  async function submit() {
    const coin = (coinInput.value || '').trim();
    const action = actionSelect.value;
    const size = sizeInput.value ? Number(sizeInput.value) : undefined;

    if (!coin) return show('Please enter a coin (e.g., BTC)', true);
    if ((action === 'Long' || action === 'Short') && (!size || Number.isNaN(size))) return show('Please provide a valid position size for opening a position', true);

    const payload = { Action: action };
    if (action === 'Long' || action === 'Short') payload.positionSize = size;
    // Build URL with optional tableName query param
    const tableName = (tableInput && tableInput.value) ? tableInput.value.trim() : (process.env && process.env.TRADE_TABLE) || '';
    let url = `https://trade.itsarex.com/manage/${coin}`;
    if (tableName) url += `?tableName=${encodeURIComponent(tableName)}`;

    show('Sending request...');
    try {
      const resp = await axios.post(url, payload, { timeout: 10000 });
      show(JSON.stringify(resp.data));
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) show('Error: ' + JSON.stringify(err.response.data), true);
      else show('Request error: ' + (err.message || err), true);
    }
  }

  submitBtn.addEventListener('click', submit);
  clearBtn.addEventListener('click', () => { coinInput.value = ''; sizeInput.value = ''; actionSelect.value = 'Long'; result.textContent = ''; });
})();
