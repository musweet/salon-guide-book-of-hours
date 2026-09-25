// Browser data loader for the dev split.
// Source data: src/data.json. Browser <script> tags cannot require().
window.DATA = JSON.parse(document.getElementById('data').textContent);
