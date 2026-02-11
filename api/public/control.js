(function(){
  const coinInput = document.getElementById('coin');
  const tableInput = document.getElementById('tableName');
  const actionSelect = document.getElementById('action');
  const sizeInput = document.getElementById('size');
  const percSizeInput = document.getElementById('percSize');
  const percSizeLabel = document.getElementById('percSizeLabel');
  const submitBtn = document.getElementById('submit');
  const clearBtn = document.getElementById('clear');
  const result = document.getElementById('result');

  function show(msg, isError) {
    result.textContent = msg;
    result.style.color = isError ? 'crimson' : '#222';
  }

  // Show/hide percSize input based on selected action
  actionSelect.addEventListener('change', () => {
    if (actionSelect.value === 'PartialClose') {
      percSizeLabel.style.display = 'block';
      sizeInput.parentElement.style.display = 'none';
    } else {
      percSizeLabel.style.display = 'none';
      sizeInput.parentElement.style.display = 'block';
    }
  });

  async function submit() {
    const coin = (coinInput.value || '').trim();
    const action = actionSelect.value;
    const tableName = (tableInput && tableInput.value) ? tableInput.value.trim() : (process.env && process.env.TRADE_TABLE) || '';

    if (!coin) return show('Please enter a coin (e.g., BTC)', true);

    // Handle PartialClose action
    if (action === 'PartialClose') {
      const percSize = percSizeInput.value ? Number(percSizeInput.value) : undefined;
      if (!percSize || Number.isNaN(percSize) || percSize <= 0 || percSize >= 100) {
        return show('Please provide a valid percentage between 0 and 100', true);
      }

      let url = `/partialclose?coinName=${encodeURIComponent(coin)}&percSize=${percSize}`;
      if (tableName) url += `&tableName=${encodeURIComponent(tableName)}`;

      show('Sending partial close request...');
      try {
        const resp = await axios.get(url, { timeout: 10000 });
        show(JSON.stringify(resp.data));
      } catch (err) {
        console.error(err);
        if (err.response && err.response.data) show('Error: ' + JSON.stringify(err.response.data), true);
        else show('Request error: ' + (err.message || err), true);
      }
      return;
    }

    // Handle other actions (Long, Short, Close*)
    const size = sizeInput.value ? Number(sizeInput.value) : undefined;
    if ((action === 'Long' || action === 'Short') && (!size || Number.isNaN(size))) {
      return show('Please provide a valid position size for opening a position', true);
    }

    const payload = { Action: action };
    if (action === 'Long' || action === 'Short') payload.positionSize = size;
    
    let url = `/manage/${coin}`;
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
  clearBtn.addEventListener('click', () => { 
    coinInput.value = ''; 
    sizeInput.value = ''; 
    percSizeInput.value = '';
    actionSelect.value = 'Long'; 
    percSizeLabel.style.display = 'none';
    sizeInput.parentElement.style.display = 'block';
    result.textContent = ''; 
  });
})();
