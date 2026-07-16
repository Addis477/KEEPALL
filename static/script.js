// Global variables
let currentFolder = '';
let shareFile = { url: '', name: '' };

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Enter key for password
    document.getElementById('password')?.addEventListener('keyup', function(e) {
        if (e.key === 'Enter') unlock();
    });
    
    // File input change
    document.getElementById('fileInput')?.addEventListener('change', function(e) {
        if (this.files.length > 0) {
            uploadFiles(this.files);
            this.value = '';
        }
    });
    
    // Upload zone click
    document.getElementById('uploadZone')?.addEventListener('click', function() {
        document.getElementById('fileInput').click();
    });
});

// Authentication
async function unlock() {
    const password = document.getElementById('password').value;
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('lockScreen').classList.add('hidden');
            document.getElementById('home').classList.remove('hidden');
            loadGallery();
        } else {
            document.getElementById('error').textContent = 'Wrong password';
        }
    } catch (error) {
        document.getElementById('error').textContent = 'Connection error';
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    document.getElementById('home').classList.add('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('lockScreen').classList.remove('hidden');
    document.getElementById('password').value = '';
}

// Navigation
function openDashboard() {
    document.getElementById('home').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    currentFolder = '';
    loadFiles();
}

function goHome() {
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('home').classList.remove('hidden');
    loadGallery();
}

// File operations
async function loadFiles() {
    const search = document.getElementById('searchInput')?.value || '';
    
    try {
        const response = await fetch(`/api/files?folder=${currentFolder}&search=${search}`);
        const data = await response.json();
        
        updateBreadcrumb();
        document.getElementById('currentFolderLabel').textContent = currentFolder || 'Root';
        renderFileList(data.files);
    } catch (error) {
        showStatus('Error loading files', false);
    }
}

function renderFileList(files) {
    const fileList = document.getElementById('fileList');
    
    if (files.length === 0) {
        fileList.innerHTML = '<div class="empty-state"><span>📂</span>No files</div>';
        return;
    }
    
    fileList.innerHTML = files.map(file => `
        <div class="file-row" onclick="${file.type === 'folder' ? `navigateToFolder('${file.folder}')` : `previewFile('${file.public_id}')`}">
            <div class="file-thumb">
                ${file.is_image ? `<img src="${file.url}" loading="lazy" />` : file.icon}
            </div>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-meta">
                    ${file.type === 'folder' ? 'Folder' : file.size_display}
                    ${file.date_display ? ' · ' + file.date_display : ''}
                </div>
            </div>
            ${file.url && file.type !== 'folder' ? `
                <div class="file-btns" onclick="event.stopPropagation()">
                    <button onclick="copyUrl('${file.url}')">📋</button>
                    <button onclick="downloadFile('${file.url}', '${file.name}')">⬇️</button>
                    <button class="share" onclick="openShare('${file.url}', '${file.name}')">🔗</button>
                    <button class="del" onclick="deleteFile('${file.public_id}')">🗑</button>
                </div>
            ` : file.type === 'folder' ? `
                <div class="file-btns" onclick="event.stopPropagation()">
                    <button class="del" onclick="deleteFile('${file.public_id}')">🗑</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    let html = '<span onclick="navigateToFolder(\'\')">📂 Root</span>';
    
    if (currentFolder) {
        const parts = currentFolder.split('/');
        let path = '';
        parts.forEach(part => {
            path += (path ? '/' : '') + part;
            html += ' <span>›</span> <span onclick="navigateToFolder(\'' + path + '\')">📁 ' + part + '</span>';
        });
    }
    
    breadcrumb.innerHTML = html;
}

function navigateToFolder(folder) {
    currentFolder = folder;
    loadFiles();
}

// Upload
async function uploadFiles(files) {
    showStatus(`Uploading ${files.length} file(s)...`, false);
    
    const formData = new FormData();
    for (let file of files) {
        formData.append('files', file);
    }
    formData.append('folder', currentFolder);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.success) {
            showStatus(`✅ ${data.files.length} uploaded`, true);
            loadFiles();
        } else {
            showStatus('Upload failed', false);
        }
    } catch (error) {
        showStatus('Upload error', false);
    }
}

// Create
function showCreateFileModal() {
    document.getElementById('createFileModal').classList.remove('hidden');
    document.getElementById('cfName').value = '';
    document.getElementById('cfContent').value = '';
}

async function createFile() {
    const name = document.getElementById('cfName').value.trim();
    const content = document.getElementById('cfContent').value;
    
    if (!name) {
        alert('Enter filename');
        return;
    }
    
    try {
        const response = await fetch('/api/create-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, content, folder: currentFolder })
        });
        const data = await response.json();
        
        if (data.success) {
            hideModal('createFileModal');
            loadFiles();
            showStatus('✅ File created!', true);
        }
    } catch (error) {
        showStatus('Error creating file', false);
    }
}

function showCreateFolderModal() {
    document.getElementById('createFolderModal').classList.remove('hidden');
    document.getElementById('folderName').value = '';
}

async function createFolder() {
    const name = document.getElementById('folderName').value.trim();
    
    if (!name) {
        alert('Enter folder name');
        return;
    }
    
    try {
        const response = await fetch('/api/create-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, folder: currentFolder })
        });
        const data = await response.json();
        
        if (data.success) {
            hideModal('createFolderModal');
            loadFiles();
            showStatus('📁 Folder created!', true);
        }
    } catch (error) {
        showStatus('Error creating folder', false);
    }
}

// Delete
async function deleteFile(publicId) {
    if (!confirm('Delete this file/folder?')) return;
    
    try {
        const response = await fetch(`/api/delete/${publicId}`, { method: 'DELETE' });
        const data = await response.json();
        
        if (data.success) {
            loadFiles();
            showStatus('🗑 Deleted', true);
        }
    } catch (error) {
        showStatus('Error deleting', false);
    }
}

// Preview
async function previewFile(publicId) {
    try {
        const response = await fetch(`/api/share/${publicId}`);
        const data = await response.json();
        
        if (data.url) {
            const previewContent = document.getElementById('previewContent');
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(data.name);
            const isVideo = /\.(mp4|mov|webm)$/i.test(data.name);
            const isPDF = /\.pdf$/i.test(data.name);
            
            if (isImage) {
                previewContent.innerHTML = `
                    <img src="${data.url}" class="preview-img" />
                    <p style="text-align:center;margin-top:8px;font-size:13px;">
                        ${data.name}
                        <br>
                        <button class="btn-save" style="margin-top:8px;padding:8px 16px;" onclick="openShare('${data.url}', '${data.name}')">🔗 Share</button>
                    </p>
                `;
            } else if (isVideo) {
                previewContent.innerHTML = `
                    <video src="${data.url}" controls class="preview-video" playsinline></video>
                    <p style="text-align:center;font-size:13px;">
                        ${data.name}
                        <br>
                        <button class="btn-save" style="margin-top:8px;padding:8px 16px;" onclick="openShare('${data.url}', '${data.name}')">🔗 Share</button>
                    </p>
                `;
            } else if (isPDF) {
                previewContent.innerHTML = `
                    <iframe src="${data.url}"></iframe>
                    <p style="text-align:center;font-size:13px;">
                        ${data.name}
                        <br>
                        <button class="btn-save" style="margin-top:8px;padding:8px 16px;" onclick="openShare('${data.url}', '${data.name}')">🔗 Share</button>
                    </p>
                `;
            } else {
                previewContent.innerHTML = `
                    <div style="text-align:center;padding:30px 15px;">
                        <p style="font-size:40px;">📄</p>
                        <p>${data.name}</p>
                        <a href="${data.url}" target="_blank">Open File</a>
                        <br>
                        <button class="btn-save" style="margin-top:8px;padding:8px 16px;" onclick="openShare('${data.url}', '${data.name}')">🔗 Share</button>
                    </div>
                `;
            }
            
            document.getElementById('previewModal').classList.remove('hidden');
        }
    } catch (error) {
        showStatus('Error loading preview', false);
    }
}

// Share
function openShare(url, name) {
    shareFile = { url, name };
    document.getElementById('shareUrl').value = url;
    document.getElementById('shareFileName').textContent = '📄 ' + name;
    document.getElementById('shareModal').classList.remove('hidden');
}

function copyShareUrl() {
    navigator.clipboard.writeText(shareFile.url).then(() => {
        showStatus('✅ Link copied!', true);
    });
}

function shareTo(platform) {
    const url = encodeURIComponent(shareFile.url);
    const text = encodeURIComponent('Check out: ' + shareFile.name);
    let shareUrl = '';
    
    switch(platform) {
        case 'telegram':
            shareUrl = `https://t.me/share/url?url=${url}&text=${text}`;
            break;
        case 'whatsapp':
            shareUrl = `https://wa.me/?text=${text}%20${url}`;
            break;
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
            break;
        case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?url=${url}&text=${text}`;
            break;
        case 'email':
            shareUrl = `mailto:?subject=${encodeURIComponent(shareFile.name)}&body=${encodeURIComponent('File: ' + shareFile.url)}`;
            break;
    }
    
    window.open(shareUrl, '_blank');
}

function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        showStatus('✅ Copied!', true);
    });
}

async function downloadFile(url, name) {
    showStatus('Downloading...', false);
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        showStatus('✅ Downloaded!', true);
    } catch (error) {
        window.open(url, '_blank');
    }
}

// Gallery
async function loadGallery() {
    try {
        const response = await fetch('/api/gallery');
        const data = await response.json();
        
        const gallery = document.getElementById('gallery');
        if (data.images.length > 0) {
            gallery.innerHTML = data.images.map(img => `
                <div class="gallery-card" onclick="openDashboard()">
                    <img src="${img.url}" loading="lazy" alt="${img.name}" />
                    <div class="info">
                        <span>${img.name}</span>
                        <span>${img.size_display}</span>
                    </div>
                </div>
            `).join('');
        } else {
            gallery.innerHTML = '<p style="color:#4ade80;opacity:0.5;font-size:13px;padding:15px;">No images yet</p>';
        }
    } catch (error) {
        console.error('Error loading gallery:', error);
    }
}

// Utility
function hideModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function showStatus(message, success) {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = message;
        status.className = 'status ' + (success ? 'ok' : '');
        if (success) {
            setTimeout(() => {
                status.textContent = '';
                status.className = 'status';
            }, 3000);
        }
    }
}
