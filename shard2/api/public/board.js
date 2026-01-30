(function () {
    async function fetchBoardData() {
        const userId = Settings.getUserId();
        const container = document.getElementById('boardContent');
        const emptyState = document.getElementById('emptyState');
        const loadingState = document.getElementById('loadingState');
        const statsEl = document.getElementById('boardStats');

        if (userId === '') {
            loadingState.classList.add('d-none');
            emptyState.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-person-exclamation display-1 text-secondary"></i>
                    <h3 class="mt-3">User ID Required</h3>
                    <p class="text-muted">Please set your User ID in the settings to view board trades.</p>
                    <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#settingsModal">Open Settings</button>
                </div>
            `;
            emptyState.classList.remove('d-none');
            container.classList.add('d-none');
            return;
        }

        loadingState.classList.remove('d-none');
        container.classList.add('d-none');
        emptyState.classList.add('d-none');
        statsEl.innerHTML = '';

        try {
            const response = await axios.get(`/activeTrades?id=${userId}`);
            const data = response.data;
            loadingState.classList.add('d-none');

            // Data Validation based on user example
            if (!data || !data.positions) {
                throw new Error("Invalid data format received");
            }

            const { currentProfit, openPositions } = data.positions;

            // Render Stats
            const profitClass = currentProfit >= 0 ? 'text-success' : 'text-danger';
            statsEl.innerHTML = `
                <div class="col-md-4">
                    <div class="card h-100">
                        <div class="card-body text-center">
                            <h6 class="card-subtitle mb-2 text-muted">Current Profit</h6>
                            <h2 class="card-title ${profitClass}">$${Number(currentProfit).toFixed(2)}</h2>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100">
                         <div class="card-body text-center">
                            <h6 class="card-subtitle mb-2 text-muted">Open Positions</h6>
                            <h2 class="card-title text-white">${openPositions.length}</h2>
                        </div>
                    </div>
                </div>
                 <div class="col-md-4">
                    <div class="card h-100">
                         <div class="card-body text-center">
                            <h6 class="card-subtitle mb-2 text-muted">User Index</h6>
                            <h2 class="card-title text-primary">#${userId}</h2>
                        </div>
                    </div>
                </div>
            `;

            if (openPositions.length === 0) {
                emptyState.innerHTML = '<div class="text-center py-5"><h4>No open positions found.</h4></div>';
                emptyState.classList.remove('d-none');
                return;
            }

            container.classList.remove('d-none');
            const tbody = document.getElementById('boardTableBody');
            tbody.innerHTML = '';

            openPositions.forEach(pos => {
                const pnl = parseFloat(pos.unrealizedProfit);
                const pnlClass = pnl >= 0 ? 'text-success' : 'text-danger';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><span class="fw-bold text-white">${pos.symbol.replace('USDT', '')}</span> <span class="badge bg-secondary" style="font-size:0.7em">USDT</span></td>
                    <td><span class="badge ${pos.positionSide === 'LONG' ? 'bg-success' : 'bg-danger'}">${pos.positionSide}</span> x${pos.leverage}</td>
                    <td>${Number(pos.entryPrice).toFixed(5)}</td>
                    <td>${Number(pos.breakEvenPrice).toFixed(5)}</td>
                    <td>${Number(pos.positionAmt).toFixed(3)}</td>
                    <td>$${Number(pos.initialMargin).toFixed(2)}</td>
                    <td class="${pnlClass} fw-bold">$${pnl.toFixed(2)}</td>
                `;
                tbody.appendChild(tr);
            });


        } catch (err) {
            loadingState.classList.add('d-none');
            emptyState.innerHTML = `
                <div class="alert alert-danger">
                    <h4>Error Fetching Data</h4>
                    <p>${err.message || "Could not connect to Board API"}</p>
                    <small>Ensure http://board.itsarex.com:5051 is accessible.</small>
                </div>
            `;
            emptyState.classList.remove('d-none');
            console.error(err);
        }
    }

    // Initial Load
    document.addEventListener('DOMContentLoaded', fetchBoardData);

    // Refresh Button
    document.getElementById('refreshBoardBtn').addEventListener('click', fetchBoardData);

})();
