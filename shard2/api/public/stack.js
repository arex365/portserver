(function(){
  const tableSelect = document.getElementById("tableSelect");
  const startDateInput = document.getElementById("startDateInput");
  const endDateInput = document.getElementById("endDateInput");
  const loadBtn = document.getElementById("loadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusMsg = document.getElementById("statusMsg");
  const bricksContainer = document.getElementById("bricksContainer");

  const ctx = document.getElementById("coinPnlChart");
  let chartRef = null;

  function showMessage(text, type = "info") {
    if (!text) {
      statusMsg.classList.add("d-none");
      statusMsg.textContent = "";
      return;
    }
    statusMsg.className = `alert alert-${type}`;
    statusMsg.textContent = text;
  }

  async function loadTables(){
    try {
      const resp = await axios.get("/tables", { timeout: 5000 });
      const tables = (resp && resp.data && Array.isArray(resp.data.tables)) ? resp.data.tables : [];
      tableSelect.innerHTML = "";
      tables.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        tableSelect.appendChild(opt);
      });
    } catch (err) {
      console.warn("Could not load tables:", err.message || err);
    }
  }

  function applyDateFilter(trades){
    let filtered = trades.slice();
    if (startDateInput.value) {
      const start = new Date(startDateInput.value);
      start.setHours(0,0,0,0);
      filtered = filtered.filter(t => {
        if (!t.entryTime) return false;
        const entryDate = new Date(t.entryTime * 1000);
        entryDate.setHours(0,0,0,0);
        return entryDate >= start;
      });
    }
    if (endDateInput.value) {
      const end = new Date(endDateInput.value);
      end.setHours(0,0,0,0);
      filtered = filtered.filter(t => {
        if (!t.entryTime) return false;
        const entryDate = new Date(t.entryTime * 1000);
        entryDate.setHours(0,0,0,0);
        return entryDate <= end;
      });
    }
    return filtered;
  }

  function groupRealizedByCoin(trades){
    const agg = {};
    trades.forEach(t => {
      if (!t || (t.status && t.status.toLowerCase() !== "close")) return;
      if (typeof t.pnl !== "number") return;
      const coin = t.coinName || "UNKNOWN";
      if (!agg[coin]) agg[coin] = { wins: 0, losses: 0, net: 0, tradeCount: 0, winCount: 0, lossCount: 0 };
      if (t.pnl >= 0) {
        agg[coin].wins += t.pnl;
        agg[coin].winCount += 1;
      } else {
        agg[coin].losses += t.pnl;
        agg[coin].lossCount += 1;
      }
      agg[coin].net += t.pnl;
      agg[coin].tradeCount += 1;
    });
    // Sort coins by net descending
    const entries = Object.entries(agg).sort((a,b) => b[1].net - a[1].net);
    return entries;
  }

  function renderBricks(entries){
    bricksContainer.innerHTML = '';
    if (!entries.length) {
      bricksContainer.innerHTML = '<p class="text-muted">No data to display</p>';
      return;
    }

    entries.forEach(([coin, data]) => {
      const brick = document.createElement('div');
      brick.className = `brick ${data.net >= 0 ? 'positive' : 'negative'}`;
      
      brick.innerHTML = `
        <div class="brick-coin">${coin}</div>
        <div class="brick-pnl ${data.net >= 0 ? 'positive' : 'negative'}">
          ${data.net >= 0 ? '+' : ''}$${data.net.toFixed(2)}
        </div>
        <div class="brick-stats">
          <div class="brick-detail">
            <strong>Wins:</strong>
            <span>${data.winCount} trades</span>
            <span>$${data.wins.toFixed(2)}</span>
          </div>
          <div class="brick-detail">
            <strong>Losses:</strong>
            <span>${data.lossCount} trades</span>
            <span>$${data.losses.toFixed(2)}</span>
          </div>
          <div class="brick-detail">
            <strong>Total:</strong>
            <span>${data.tradeCount} trades</span>
            <span>${data.winCount > 0 ? ((data.winCount / data.tradeCount) * 100).toFixed(1) : 0}% win</span>
          </div>
        </div>
      `;
      
      bricksContainer.appendChild(brick);
    });
  }

  function renderChart(entries){
    if (chartRef) chartRef.destroy();
    
    const labels = entries.map(([coin]) => coin);
    const wins = entries.map(([,v]) => Number(v.wins.toFixed(2)));
    const losses = entries.map(([,v]) => Number(v.losses.toFixed(2)));
    const net = entries.map(([,v]) => Number(v.net.toFixed(2)));
    const counts = entries.map(([,v]) => v.tradeCount);

    chartRef = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Wins',
            data: wins,
            backgroundColor: '#198754',
            stack: 'pnl'
          },
          {
            label: 'Losses',
            data: losses,
            backgroundColor: '#dc3545',
            stack: 'pnl'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: {
            stacked: true,
            ticks: { callback: v => `$${Number(v).toFixed(0)}` }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              footer: (items) => {
                const idx = items[0].dataIndex;
                return `Net: $${net[idx].toFixed(2)} | Trades: ${counts[idx]}`;
              }
            }
          },
          legend: { position: 'top' }
        }
      }
    });
  }

  async function loadData(){
    showMessage('Loading trades...', 'info');
    const params = {};
    if (tableSelect.value) params.tableName = tableSelect.value;
    params.status = 'close';
    
    try {
      const resp = await axios.get('/gettrades', { params, timeout: 10000 });
      const trades = Array.isArray(resp.data?.trades) ? resp.data.trades : [];
      const filtered = applyDateFilter(trades);
      const entries = groupRealizedByCoin(filtered);
      
      if (!entries.length) {
        showMessage('No closed trades found for the selected filters.', 'warning');
        bricksContainer.innerHTML = '<p class="text-muted">No data to display</p>';
        if (chartRef) chartRef.destroy();
        return;
      }
      
      renderBricks(entries);
      renderChart(entries);
      showMessage(`Loaded ${entries.length} coin${entries.length>1?'s':''} with ${filtered.length} total trades.`, 'success');
    } catch (err) {
      console.error(err);
      showMessage('Error loading trades: ' + (err.message || err), 'danger');
    }
  }

  function clearData(){
    startDateInput.value = '';
    endDateInput.value = '';
    bricksContainer.innerHTML = '<p class="text-muted">Load data to see coins...</p>';
    if (chartRef) chartRef.destroy();
    showMessage('', 'info');
  }

  loadBtn.addEventListener('click', loadData);
  clearBtn.addEventListener('click', clearData);

  // init
  loadTables();
})();
