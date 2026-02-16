(function () {
  const startDateInput = document.getElementById('startDateInput');
  const endDateInput = document.getElementById('endDateInput');
  const tableSelect = document.getElementById('tableSelect');
  const fetchBtn = document.getElementById('fetchBtn');
  const exportBtn = document.getElementById('exportBtn');
  const message = document.getElementById('message');
  const messageText = document.getElementById('messageText');
  const loadingSpinner = document.querySelector('.loading-spinner');
  const emptyState = document.getElementById('emptyState');
  const dailyTable = document.getElementById('dailyTable');
  const dailyTableBody = document.getElementById('dailyTableBody');

  let chartInstance = null;
  let dailyData = [];

  // Set default dates (oldest trade to today)
  async function setDefaultDates() {
    const end = new Date();
    endDateInput.value = formatDateForInput(end);
    
    try {
      // Try to load tables first
      const tablesResp = await axios.get('/tables', { timeout: 5000 });
      if (tablesResp.data && Array.isArray(tablesResp.data.tables) && tablesResp.data.tables.length > 0) {
        const firstTable = tablesResp.data.tables[0];
        
        // Fetch ALL trades (both open and closed) to find oldest one
        const tradesResp = await axios.get('/gettrades', {
          params: {
            tableName: firstTable
            // No status filter - get all trades
          },
          timeout: 30000
        });
        
        if (tradesResp.data && Array.isArray(tradesResp.data.trades)) {
          const trades = tradesResp.data.trades;
          if (trades.length > 0) {
            // Sort by entryTime to find oldest
            const sorted = trades.sort((a, b) => a.entryTime - b.entryTime);
            const oldestTrade = sorted[0];
            if (oldestTrade && oldestTrade.entryTime) {
              const oldestDate = new Date(oldestTrade.entryTime * 1000);
              startDateInput.value = formatDateForInput(oldestDate);
              return;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Could not auto-detect date range:', err.message);
    }
    
    // Fallback to last 30 days
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDateInput.value = formatDateForInput(start);
  }

  function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDateDisplay(date) {
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function showMessage(txt, isLoading = false) {
    if (!txt) {
      message.classList.add('d-none');
      return;
    }
    messageText.textContent = txt;
    message.classList.remove('d-none', 'alert-danger', 'alert-success');
    message.classList.add('alert-info');
    if (loadingSpinner) {
      loadingSpinner.style.display = isLoading ? 'inline-block' : 'none';
    }
  }

  function showError(txt) {
    messageText.textContent = txt;
    message.classList.remove('d-none', 'alert-success');
    message.classList.add('alert-danger');
    loadingSpinner.style.display = 'none';
  }

  function showSuccess(txt) {
    messageText.textContent = txt;
    message.classList.remove('d-none', 'alert-danger');
    message.classList.add('alert-success');
    loadingSpinner.style.display = 'none';
  }

  // Load tables
  async function loadTables() {
    try {
      const resp = await axios.get('/tables', { timeout: 5000 });
      if (resp.data && Array.isArray(resp.data.tables)) {
        tableSelect.innerHTML = '';
        resp.data.tables.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          tableSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Could not load tables:', err.message);
    }
  }

  // Fetch and process data
  async function fetchData() {
    try {
      showMessage('Loading data...', true);

      const tableName = tableSelect.value;
      if (!tableName) {
        showError('Please select a table');
        return;
      }

      const startDate = new Date(startDateInput.value);
      const endDate = new Date(endDateInput.value);

      if (startDate > endDate) {
        showError('Start date must be before end date');
        return;
      }

      // Fetch all closed positions from the table
      const resp = await axios.get('/gettrades', {
        params: {
          tableName,
          status: 'close'
        },
        timeout: 30000,
      });

      if (!resp.data || !Array.isArray(resp.data.trades)) {
        showError('Invalid response from server');
        return;
      }

      // Process and aggregate by day
      dailyData = aggregateByDay(resp.data.trades, startDate, endDate);

      if (dailyData.length === 0) {
        showError('No closed positions found in this date range');
        return;
      }

      updateStats();
      renderChart();
      renderTable();
      showSuccess(`Loaded ${dailyData.length} days of data`);
    } catch (err) {
      console.error('Error fetching data:', err);
      showError(`Error: ${err.message || 'Failed to fetch data'}`);
    }
  }

  function aggregateByDay(positions, startDate, endDate) {
    const dayMap = {};

    positions.forEach((pos) => {
      if (typeof pos.pnl !== 'number' || !pos.exitTime) return;

      const closeDate = new Date(pos.exitTime * 1000);
      closeDate.setHours(0, 0, 0, 0);
      
      const filterStart = new Date(startDate);
      filterStart.setHours(0, 0, 0, 0);
      const filterEnd = new Date(endDate);
      filterEnd.setHours(23, 59, 59, 999);
      
      if (closeDate < filterStart || closeDate > filterEnd) return;

      const dayKey = formatDateForInput(closeDate);

      if (!dayMap[dayKey]) {
        dayMap[dayKey] = {
          date: closeDate,
          dayKey,
          totalPnl: 0,
          tradesClosed: 0,
          wins: 0,
          losses: 0,
          trades: [],
        };
      }

      dayMap[dayKey].totalPnl += pos.pnl;
      dayMap[dayKey].tradesClosed += 1;
      dayMap[dayKey].trades.push(pos.pnl);

      if (pos.pnl > 0) {
        dayMap[dayKey].wins += 1;
      } else if (pos.pnl < 0) {
        dayMap[dayKey].losses += 1;
      }
    });

    return Object.values(dayMap).sort((a, b) => a.date - b.date);
  }

  function updateStats() {
    const totalPnl = dailyData.reduce((sum, d) => sum + d.totalPnl, 0);
    const winningDays = dailyData.filter((d) => d.totalPnl > 0).length;
    const losingDays = dailyData.filter((d) => d.totalPnl < 0).length;
    const avgDailyPnl = dailyData.length > 0 ? totalPnl / dailyData.length : 0;

    document.getElementById('totalPnl').textContent = formatCurrency(totalPnl);
    document.getElementById('winningDays').textContent = winningDays;
    document.getElementById('losingDays').textContent = losingDays;
    document.getElementById('avgDailyPnl').textContent = formatCurrency(avgDailyPnl);
  }

  function renderChart() {
    const ctx = document.getElementById('candleChart').getContext('2d');

    const labels = dailyData.map((d) => formatDateDisplay(d.date));
    const dataValues = dailyData.map((d) => d.totalPnl);
    
    // Colors: green for positive, red for negative
    const colors = dailyData.map((d) => d.totalPnl >= 0 ? '#84fab0' : '#fa709a');
    const borderColors = dailyData.map((d) => d.totalPnl >= 0 ? '#4ade80' : '#ef4444');

    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Daily P&L',
            data: dataValues,
            backgroundColor: colors,
            borderColor: borderColors,
            borderWidth: 2,
            borderRadius: 6,
            barPercentage: 0.8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return formatCurrency(context.parsed.y);
              },
              afterLabel: function (context) {
                const dayData = dailyData[context.dataIndex];
                return `Trades: ${dayData.tradesClosed} | Wins: ${dayData.wins}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value) {
                return '$' + value.toLocaleString();
              },
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)',
            },
          },
          x: {
            grid: {
              display: false,
            },
          },
        },
      },
    });
  }

  function renderTable() {
    dailyTableBody.innerHTML = '';

    dailyData.forEach((day) => {
      const winRate = day.tradesClosed > 0 
        ? ((day.wins / day.tradesClosed) * 100).toFixed(1)
        : 0;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${formatDateDisplay(day.date)}</td>
        <td>
          <span class="${day.totalPnl >= 0 ? 'text-success' : 'text-danger'}" style="font-weight: bold;">
            ${formatCurrency(day.totalPnl)}
          </span>
        </td>
        <td>${day.tradesClosed}</td>
        <td>${winRate}%</td>
      `;
      dailyTableBody.appendChild(row);
    });

    emptyState.style.display = 'none';
    dailyTable.style.display = 'table';
  }

  function exportToCSV() {
    if (dailyData.length === 0) {
      showError('No data to export');
      return;
    }

    let csv = 'Date,Realized P&L,Trades Closed,Wins,Losses,Win Rate\n';

    dailyData.forEach((day) => {
      const winRate = day.tradesClosed > 0 
        ? ((day.wins / day.tradesClosed) * 100).toFixed(1)
        : 0;
      csv += `${formatDateDisplay(day.date)},${day.totalPnl.toFixed(2)},${day.tradesClosed},${day.wins},${day.losses},${winRate}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-pnl-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  // Event listeners
  fetchBtn.addEventListener('click', fetchData);
  exportBtn.addEventListener('click', exportToCSV);

  // Initialize
  (async () => {
    await setDefaultDates();
    loadTables();
  })();
})();
