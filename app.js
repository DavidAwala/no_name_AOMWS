import {port_url} from "./port"
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const loader = document.getElementById('loader');
    const results = document.getElementById('results');

    loader.classList.remove('hidden');
    results.classList.add('hidden');

    try {
        const response = await fetch(`${port_url}/api/process`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Display Results
        const taskId = data.taskId;

        // Ground Floor
        const gfViz = document.getElementById('gf-viz');
        gfViz.innerHTML = `<img src="/tasks/${taskId}/GF.svg" alt="Ground Floor Structure" style="max-width:100%;">`;
        document.getElementById('gf-download').href = `/tasks/${taskId}/GF.svg`;

        // First Floor
        const ffViz = document.getElementById('ff-viz');
        ffViz.innerHTML = `<img src="/tasks/${taskId}/FF.svg" alt="First Floor Structure" style="max-width:100%;">`;
        document.getElementById('ff-download').href = `/tasks/${taskId}/FF.svg`;

        loader.classList.add('hidden');
        results.classList.remove('hidden');

    } catch (err) {
        console.error(err);
        loader.innerText = 'Error: ' + err.message;
        loader.classList.remove('hidden');
    }
});
