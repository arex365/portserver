(function () {
  const tableSelect = document.getElementById("tableSelect");
  const startDateInput = document.getElementById("startDateInput");
  const endDateInput = document.getElementById("endDateInput");
  const maxTradesInput = document.getElementById("maxTradesInput");
  const sortToggle = document.getElementById("sortToggle");
  const loadBtn = document.getElementById("loadBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusMsg = document.getElementById("statusMsg");
  const brickTable = document.getElementById("brickTable");

  function showMessage(text, type = "info") {
    if (!text) {
      statusMsg.classList.add("d-none");
      statusMsg.textContent = "";
      return;
    }
    statusMsg.className = `alert alert-${type}`;
    statusMsg.textContent = text;
  }

  async function loadTables() {
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

  function applyDateFilter(trades) {
    let filtered = trades.slice();
    if (startDateInput.value) {
      const start = new Date(startDateInput.value);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(t => {
        if (!t.entryTime) return false;
        const entryDate = new Date(t.entryTime * 1000);
        entryDate.setHours(0, 0, 0, 0);
        return entryDate >= start;
      });
    }
    if (endDateInput.value) {
      const end = new Date(endDateInput.value);
      end.setHours(0, 0, 0, 0);
      filtered = filtered.filter(t => {
        if (!t.entryTime) return false;
        const entryDate = new Date(t.entryTime * 1000);
        entryDate.setHours(0, 0, 0, 0);
        return entryDate <= end;
      });
    }
    return filtered;
  }

  function groupTradesByCoin(trades, maxTrades) {
    const grouped = {};
    trades.forEach(t => {
      if (!t || (t.status && t.status.toLowerCase() !== "close")) return;
      if (typeof t.pnl !== "number") return;
      const coin = t.coinName || "UNKNOWN";
      if (!grouped[coin]) grouped[coin] = [];
      grouped[coin].push(t);
    });

    // Sort coins by total net P&L descending
    const entries = Object.entries(grouped).map(([coin, trades]) => {
      const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
      return { coin, trades, netPnl };
    }).sort((a, b) => b.netPnl - a.netPnl);

    // Limit trades per coin
    entries.forEach(entry => {
      if (entry.trades.length > maxTrades) {
        entry.trades = entry.trades.slice(0, maxTrades);
      }
    });

    return entries;
  }

  function drawBricks(coinEntries) {
    brickTable.innerHTML = '';

    if (!coinEntries.length) {
      brickTable.innerHTML = '<div class="no-data">No data to display</div>';
      return;
    }

    // Find max absolute P&L for scaling brick heights
    let maxAbsPnl = 0;
    coinEntries.forEach(entry => {
      entry.trades.forEach(t => {
        maxAbsPnl = Math.max(maxAbsPnl, Math.abs(t.pnl));
      });
    });
    if (maxAbsPnl === 0) maxAbsPnl = 1;

    const minBrickHeight = 20;
    const maxBrickHeight = 150;

    // Create each coin column
    coinEntries.forEach(entry => {
      const column = document.createElement('div');
      column.className = 'coin-column';

      const label = document.createElement('div');
      label.className = 'coin-label';
      label.textContent = entry.coin;

      const brickStack = document.createElement('div');
      brickStack.className = 'brick-stack';

      const isSorted = sortToggle.checked;

      if (isSorted) {
        // Separate positive and negative trades
        const positiveTrades = entry.trades.filter(t => t.pnl >= 0).reverse();
        const negativeTrades = entry.trades.filter(t => t.pnl < 0);

        // Create bricks for positive trades (stack upward)
        positiveTrades.forEach(trade => {
          const brick = createBrick(trade, entry.coin, maxAbsPnl, minBrickHeight, maxBrickHeight);
          brickStack.insertBefore(brick, brickStack.firstChild);
        });

        // Add center line marker
        const centerLine = document.createElement('div');
        centerLine.className = 'center-line';
        brickStack.appendChild(centerLine);

        // Create bricks for negative trades (stack downward)
        negativeTrades.forEach(trade => {
          const brick = createBrick(trade, entry.coin, maxAbsPnl, minBrickHeight, maxBrickHeight);
          brickStack.appendChild(brick);
        });
      } else {
        // Chronological order - latest trades on top (reverse order)
        const sortedTrades = [...entry.trades].sort((a, b) => {
          const timeA = a.exitTime || a.entryTime || 0;
          const timeB = b.exitTime || b.entryTime || 0;
          return timeB - timeA; // descending (latest first)
        });

        sortedTrades.forEach(trade => {
          const brick = createBrick(trade, entry.coin, maxAbsPnl, minBrickHeight, maxBrickHeight);
          brickStack.appendChild(brick);
        });
      }

      column.appendChild(brickStack);
      column.appendChild(label);
      brickTable.appendChild(column);
    });
  }

  function createBrick(trade, coin, maxAbsPnl, minHeight, maxHeight) {
    const brick = document.createElement('div');
    brick.className = `brick ${trade.pnl >= 0 ? 'positive' : 'negative'}`;

    // Calculate height based on P&L magnitude
    const pnlRatio = Math.abs(trade.pnl) / maxAbsPnl;
    const height = minHeight + (pnlRatio * (maxHeight - minHeight));
    brick.style.height = `${height}px`;

    // Display P&L on brick
    const pnlText = `$${Math.abs(trade.pnl).toFixed(1)}`;
    brick.textContent = pnlText;

    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'brick-tooltip';

    const entryDate = trade.entryTime ? new Date(trade.entryTime * 1000).toLocaleString() : 'N/A';
    const exitDate = trade.exitTime ? new Date(trade.exitTime * 1000).toLocaleString() : 'N/A';

    let tooltipHTML = `
      <strong>${coin}</strong><br>
      P&L: <strong>${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}</strong><br>
      Entry: ${entryDate}<br>
      Exit: ${exitDate}
    `;

    if (trade.entryPrice) tooltipHTML += `<br>Entry Price: $${trade.entryPrice}`;
    if (trade.exitPrice) tooltipHTML += `<br>Exit Price: $${trade.exitPrice}`;
    if (trade.size) tooltipHTML += `<br>Size: ${trade.size}`;

    tooltip.innerHTML = tooltipHTML;
    brick.appendChild(tooltip);

    return brick;
  }

  function updateSummaryStats(coinEntries) {
    let totalTrades = 0;
    let totalWins = 0;
    let totalLosses = 0;

    coinEntries.forEach(entry => {
      entry.trades.forEach(t => {
        totalTrades++;
        if (t.pnl >= 0) totalWins += t.pnl;
        else totalLosses += t.pnl;
      });
    });

    document.getElementById("totalCoins").textContent = coinEntries.length;
    document.getElementById("totalTrades").textContent = totalTrades;
    document.getElementById("totalWins").textContent = `$${totalWins.toFixed(2)}`;
    document.getElementById("totalLosses").textContent = `$${totalLosses.toFixed(2)}`;
  }

  async function loadData() {
    showMessage('Loading trades...', 'info');
    const params = {};
    if (tableSelect.value) params.tableName = tableSelect.value;
    params.status = 'close';

    try {
      const resp = await axios.get('/gettrades', { params, timeout: 10000 });
      const trades = Array.isArray(resp.data?.trades) ? resp.data.trades : [];
      const filtered = applyDateFilter(trades);
      const maxTrades = parseInt(maxTradesInput.value) || 50;
      const coinEntries = groupTradesByCoin(filtered, maxTrades);

      if (!coinEntries.length) {
        showMessage('No closed trades found for the selected filters.', 'warning');
        drawBricks([]);
        updateSummaryStats([]);
        return;
      }

      drawBricks(coinEntries);
      updateSummaryStats(coinEntries);

      const totalTrades = coinEntries.reduce((sum, e) => sum + e.trades.length, 0);
      showMessage(`Loaded ${coinEntries.length} coins with ${totalTrades} trades.`, 'success');
    } catch (err) {
      console.error(err);
      showMessage('Error loading trades: ' + (err.message || err), 'danger');
    }
  }

  // Listener for sort toggle
  if (sortToggle) {
    sortToggle.addEventListener('change', () => {
      // Reload data when sort toggle changes if we have data
      if (brickTable.children.length > 0 && !brickTable.querySelector('.no-data')) {
        loadData();
      }
    });
  }

  function clearData() {
    startDateInput.value = '';
    endDateInput.value = '';
    brickTable.innerHTML = '<div class="no-data">Load data to see bricks...</div>';
    updateSummaryStats([]);
    showMessage('', 'info');
  }

  if (loadBtn) loadBtn.addEventListener('click', loadData);
  if (clearBtn) clearBtn.addEventListener('click', clearData);

  // init
  loadTables();
})();
