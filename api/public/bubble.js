(function(){
  const tableSelect = document.getElementById("tableSelect");
  const startDateInput = document.getElementById("startDateInput");
  const endDateInput = document.getElementById("endDateInput");
  const loadBtn = document.getElementById("loadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusMsg = document.getElementById("statusMsg");

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
      if (!agg[coin]) agg[coin] = { wins: 0, losses: 0, net: 0, tradeCount: 0 };
      if (t.pnl >= 0) agg[coin].wins += t.pnl; else agg[coin].losses += t.pnl; // losses will be negative
      agg[coin].net += t.pnl;
      agg[coin].tradeCount += 1;
    });
    // Sort coins by net descending
    const entries = Object.entries(agg).sort((a,b) => b[1].net - a[1].net);
    const labels = entries.map(([coin]) => coin);
    const wins = entries.map(([,v]) => Number(v.wins.toFixed(2)));
    const losses = entries.map(([,v]) => Number(v.losses.toFixed(2))); // negative values
    const net = entries.map(([,v]) => Number(v.net.toFixed(2)));
    const counts = entries.map(([,v]) => v.tradeCount);
    return { labels, wins, losses, net, counts };
  }

  function renderStackedChart(data){
    if (chartRef) chartRef.destroy();
    chartRef = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Wins',
            data: data.wins,
            backgroundColor: '#198754',
            stack: 'pnl'
          },
          {
            label: 'Losses',
            data: data.losses, // negative values stack below axis
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
                const net = data.net[idx];
                const count = data.counts[idx];
                return `Net: $${net.toFixed(2)} | Trades: ${count}`;
              }
            }
          },
          legend: { position: 'top' }
        }
      }
    });
  }

  async function loadChart(){
    showMessage('Loading trades...', 'info');
    const params = {};
    if (tableSelect.value) params.tableName = tableSelect.value;
    // we want closed trades only for realized P&L
    params.status = 'close';
    try {
      const resp = await axios.get('/gettrades', { params, timeout: 10000 });
      const trades = Array.isArray(resp.data?.trades) ? resp.data.trades : [];
      const filtered = applyDateFilter(trades);
      const grouped = groupRealizedByCoin(filtered);
      if (!grouped.labels.length) {
        showMessage('No closed trades found for the selected filters.', 'warning');
        if (chartRef) chartRef.destroy();
        return;
      }
      renderStackedChart(grouped);
      showMessage(`Loaded ${grouped.labels.length} coin${grouped.labels.length>1?'s':''}.`, 'success');
    } catch (err) {
      console.error(err);
      showMessage('Error loading trades: ' + (err.message || err), 'danger');
    }
  }

  function clearFilters(){
    startDateInput.value = '';
    endDateInput.value = '';
    if (chartRef) chartRef.destroy();
    showMessage('', 'info');
  }

  loadBtn.addEventListener('click', loadChart);
  clearBtn.addEventListener('click', clearFilters);

  // init
  loadTables();
})();
