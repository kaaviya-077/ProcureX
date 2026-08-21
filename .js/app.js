const apiLabel = document.querySelector('[data-api-label]');
const apiStatusLabel = document.querySelector('[data-api-status-label]');
const apiBaseUrl = window.location.port === '5500' ? 'http://localhost:3000' : '';

try {
	const healthResponse = await fetch(`${apiBaseUrl}/api/health`);
	const health = await healthResponse.json();
	document.body.dataset.apiStatus = health.status;
	apiLabel.textContent = 'System ready';
	apiStatusLabel.textContent = 'API online';
} catch {
	document.body.dataset.apiStatus = 'offline';
	apiLabel.textContent = 'Preview mode';
	apiStatusLabel.textContent = 'API offline';
}
