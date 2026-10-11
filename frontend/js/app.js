// Constants
const API_BASE = `http://${window.location.hostname}:5000/api`;
let currentFolderId = null;
let breadcrumbs = [{ id: null, name: 'Root' }];
let keycloak = null;

// Initialize Keycloak
document.addEventListener('DOMContentLoaded', () => {
    try {
        keycloak = new Keycloak({
            url: `http://${window.location.hostname}:8080`,
            realm: 'file-cloud',
            clientId: 'file-cloud-client'
        });

        keycloak.init({ onLoad: 'login-required', checkLoginIframe: false }).then(authenticated => {
            if (authenticated) {
                document.getElementById('appContent').style.display = 'block';
                document.getElementById('logoutBtn').style.display = 'inline-block';

                // Keep token fresh
                setInterval(() => {
                    keycloak.updateToken(70).catch(() => console.error('Failed to refresh token'));
                }, 60000);

                // Fetch User Info
                fetch(`${API_BASE}/auth/me`, {
                    headers: { 'Authorization': `Bearer ${keycloak.token}` }
                })
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.user) {
                            document.getElementById('userInfo').innerText = `Logged in as: ${data.user.username}`;
                        }
                    }).catch(err => console.error(err));

                // Load initial contents
                loadContents();
            } else {
                document.getElementById('userInfo').innerText = 'Not authenticated';
            }
        }).catch(err => {
            console.error('Keycloak init error', err);
            document.body.innerHTML = `<h2 class="error">Failed to initialize Keycloak. Check console.</h2>`;
        });
    } catch (e) {
        console.error('Keycloak script not loaded or error', e);
        document.body.innerHTML = `<h2 class="error">Keycloak script missing. Ensure Keycloak is running.</h2>`;
    }
});

// Event Listeners
document.getElementById('logoutBtn').addEventListener('click', () => {
    if (keycloak) keycloak.logout();
});

document.getElementById('createFolderBtn').addEventListener('click', async () => {
    const name = document.getElementById('folderNameInput').value.trim();
    if (!name) return alert('Enter a folder name');

    try {
        const res = await fetch(`${API_BASE}/folders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${keycloak.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, parent_id: currentFolderId })
        });
        if (!res.ok) throw new Error('Failed to create folder');

        document.getElementById('folderNameInput').value = '';
        showStatus('Folder created successfully');
        loadContents();
    } catch (err) {
        alert(err.message);
    }
});

document.getElementById('uploadBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) return alert('Select a file first');

    const formData = new FormData();
    formData.append('file', file);
    if (currentFolderId) {
        formData.append('folder_id', currentFolderId);
    }

    try {
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.disabled = true;
        uploadBtn.innerText = 'Uploading...';

        const res = await fetch(`${API_BASE}/files`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${keycloak.token}`
            },
            body: formData
        });
        if (!res.ok) throw new Error('Failed to upload file');

        fileInput.value = '';
        showStatus('File uploaded successfully');
        loadContents();
    } catch (err) {
        alert(err.message);
    } finally {
        document.getElementById('uploadBtn').disabled = false;
        document.getElementById('uploadBtn').innerText = 'Upload';
    }
});

// Functions
async function loadContents() {
    try {
        const endpoint = currentFolderId
            ? `${API_BASE}/folders/${currentFolderId}/contents`
            : `${API_BASE}/folders/root/contents`;

        const res = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${keycloak.token}` }
        });

        if (!res.ok) throw new Error('Failed to fetch contents');
        const data = await res.json();

        renderBreadcrumbs();
        renderTable(data.folders || [], data.files || []);
    } catch (err) {
        console.error(err);
        document.getElementById('fileTableBody').innerHTML = `<tr><td colspan="4" class="error">Error loading contents</td></tr>`;
    }
}

function renderBreadcrumbs() {
    const bcContainer = document.getElementById('breadcrumbs');
    bcContainer.innerHTML = '';

    breadcrumbs.forEach((crumb, index) => {
        const span = document.createElement('span');
        span.innerText = crumb.name;

        if (index < breadcrumbs.length - 1) {
            span.className = 'crumb';
            span.onclick = () => navigateToCrumb(index, crumb.id);
            bcContainer.appendChild(span);

            const sep = document.createElement('span');
            sep.innerText = ' / ';
            bcContainer.appendChild(sep);
        } else {
            bcContainer.appendChild(span);
        }
    });
}

function navigateToCrumb(index, folderId) {
    currentFolderId = folderId;
    breadcrumbs = breadcrumbs.slice(0, index + 1);
    loadContents();
}

function renderTable(folders, files) {
    const tbody = document.getElementById('fileTableBody');
    tbody.innerHTML = '';

    if (folders.length === 0 && files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">Folder is empty</td></tr>`;
        return;
    }

    folders.forEach(folder => {
        const tr = document.createElement('tr');

        const typeTd = document.createElement('td');
        typeTd.innerText = '📁 Folder';
        tr.appendChild(typeTd);

        const nameTd = document.createElement('td');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'folder';
        nameSpan.innerText = folder.name;
        nameSpan.onclick = () => {
            currentFolderId = folder.id;
            breadcrumbs.push({ id: folder.id, name: folder.name });
            loadContents();
        };
        nameTd.appendChild(nameSpan);
        tr.appendChild(nameTd);

        const sizeTd = document.createElement('td');
        sizeTd.innerText = '-';
        tr.appendChild(sizeTd);

        const actionsTd = document.createElement('td');
        const delBtn = document.createElement('button');
        delBtn.className = 'action-btn';
        delBtn.innerText = 'Delete';
        delBtn.onclick = () => deleteFolder(folder.id, folder.name);
        actionsTd.appendChild(delBtn);
        tr.appendChild(actionsTd);

        tbody.appendChild(tr);
    });

    files.forEach(file => {
        const tr = document.createElement('tr');

        const typeTd = document.createElement('td');
        typeTd.innerText = '📄 File';
        tr.appendChild(typeTd);

        const nameTd = document.createElement('td');
        nameTd.innerText = file.original_name;
        tr.appendChild(nameTd);

        const sizeTd = document.createElement('td');
        sizeTd.innerText = formatBytes(file.size_bytes);
        tr.appendChild(sizeTd);

        const actionsTd = document.createElement('td');
        const dlBtn = document.createElement('button');
        dlBtn.className = 'download-btn';
        dlBtn.innerText = 'Download';
        dlBtn.style.marginRight = '5px';
        dlBtn.onclick = () => downloadFile(file.id, file.original_name);
        actionsTd.appendChild(dlBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'action-btn';
        delBtn.innerText = 'Delete';
        delBtn.onclick = () => deleteFile(file.id, file.original_name);
        actionsTd.appendChild(delBtn);

        tr.appendChild(actionsTd);

        tbody.appendChild(tr);
    });
}

async function deleteFolder(id, name) {
    if (!confirm(`Are you sure you want to delete folder '${name}' and all its contents?`)) return;
    try {
        const res = await fetch(`${API_BASE}/folders/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${keycloak.token}` }
        });
        if (!res.ok) throw new Error('Failed to delete folder');
        showStatus('Folder deleted');
        loadContents();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteFile(id, name) {
    if (!confirm(`Are you sure you want to delete file '${name}'?`)) return;
    try {
        const res = await fetch(`${API_BASE}/files/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${keycloak.token}` }
        });
        if (!res.ok) throw new Error('Failed to delete file');
        showStatus('File deleted');
        loadContents();
    } catch (err) {
        alert(err.message);
    }
}

async function downloadFile(id, name) {
    try {
        const res = await fetch(`${API_BASE}/files/${id}/download`, {
            headers: { 'Authorization': `Bearer ${keycloak.token}` }
        });
        if (!res.ok) throw new Error('Failed to download file');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (err) {
        alert(err.message);
    }
}

function showStatus(msg) {
    const el = document.getElementById('statusMessage');
    el.innerText = msg;
    setTimeout(() => { el.innerText = ''; }, 3000);
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
