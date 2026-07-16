from flask import Flask, render_template, request, jsonify, send_file, session
import os
import json
from datetime import datetime
from werkzeug.utils import secure_filename
from pathlib import Path
import cloudinary
import cloudinary.uploader
import cloudinary.api
from functools import wraps
import shutil

app = Flask(__name__)
app.secret_key = os.urandom(24)

# Configuration
PASSWORD = 'Good7'
UPLOAD_FOLDER = 'static/uploads'
METADATA_FILE = 'data/file_metadata.json'

# Create necessary directories
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs('data', exist_ok=True)
os.makedirs('templates', exist_ok=True)

# Cloudinary configuration (Replace with your actual credentials)
cloudinary.config(
    cloud_name="dgdlrlyct",
    api_key="YOUR_API_KEY",
    api_secret="YOUR_API_SECRET"
)

# Initialize metadata file if not exists
if not os.path.exists(METADATA_FILE):
    with open(METADATA_FILE, 'w') as f:
        json.dump({'files': []}, f)

def load_metadata():
    """Load file metadata from JSON file"""
    with open(METADATA_FILE, 'r') as f:
        return json.load(f)

def save_metadata(metadata):
    """Save file metadata to JSON file"""
    with open(METADATA_FILE, 'w') as f:
        json.dump(metadata, f, indent=2)

def login_required(f):
    """Decorator to check if user is logged in"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return jsonify({'error': 'Not authenticated'}), 401
        return f(*args, **kwargs)
    return decorated_function

def format_size(size_bytes):
    """Format file size in human-readable format"""
    if not size_bytes:
        return '0 B'
    size_bytes = int(size_bytes)
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1048576:
        return f"{size_bytes/1024:.1f} KB"
    else:
        return f"{size_bytes/1048576:.1f} MB"

def format_date(date_string):
    """Format date string to readable format"""
    if not date_string:
        return ''
    try:
        dt = datetime.fromisoformat(date_string)
        return dt.strftime('%b %d, %Y')
    except:
        return date_string

def get_file_icon(filename, file_type=None):
    """Get emoji icon for file type"""
    if file_type == 'folder':
        return '📁'
    
    ext = Path(filename).suffix.lower() if '.' in filename else ''
    icons = {
        '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️', '.webp': '🖼️',
        '.mp4': '🎬', '.mov': '🎬', '.webm': '🎬',
        '.mp3': '🎵', '.wav': '🎵',
        '.pdf': '📕',
        '.txt': '📄', '.doc': '📄', '.docx': '📄',
        '.zip': '📦', '.rar': '📦', '.7z': '📦'
    }
    return icons.get(ext, '📄')

def is_image(filename):
    """Check if file is an image"""
    ext = Path(filename).suffix.lower()
    return ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']

def is_video(filename):
    """Check if file is a video"""
    ext = Path(filename).suffix.lower()
    return ext in ['.mp4', '.mov', '.webm']

@app.route('/')
def index():
    """Home page"""
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    """Dashboard page"""
    return render_template('dashboard.html')

@app.route('/api/login', methods=['POST'])
def login():
    """Authenticate user"""
    data = request.json
    if data.get('password') == PASSWORD:
        session['logged_in'] = True
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Wrong password'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    """Logout user"""
    session.pop('logged_in', None)
    return jsonify({'success': True})

@app.route('/api/files', methods=['GET'])
@login_required
def get_files():
    """Get all files with optional filtering"""
    metadata = load_metadata()
    files = metadata.get('files', [])
    
    current_folder = request.args.get('folder', '')
    search = request.args.get('search', '').lower()
    
    # Filter by folder
    if current_folder:
        filtered_files = []
        for file in files:
            file_folder = file.get('folder', '')
            if file.get('type') == 'folder':
                # Include subfolders
                if file_folder.startswith(current_folder):
                    filtered_files.append(file)
            elif file_folder == current_folder:
                filtered_files.append(file)
        files = filtered_files
    
    # Search filter
    if search:
        files = [f for f in files if search in f.get('name', '').lower() or 
                search in f.get('folder', '').lower()]
    
    # Add computed fields
    for file in files:
        file['size_display'] = format_size(file.get('bytes', 0))
        file['date_display'] = format_date(file.get('date', ''))
        file['icon'] = get_file_icon(file.get('name', ''), file.get('type'))
        file['is_image'] = is_image(file.get('name', ''))
        file['is_video'] = is_video(file.get('name', ''))
    
    return jsonify({'files': files})

@app.route('/api/upload', methods=['POST'])
@login_required
def upload_files():
    """Upload one or more files"""
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400
    
    uploaded_files = request.files.getlist('files')
    current_folder = request.form.get('folder', '')
    
    if not uploaded_files or uploaded_files[0].filename == '':
        return jsonify({'error': 'No files selected'}), 400
    
    metadata = load_metadata()
    uploaded_list = []
    
    for file in uploaded_files:
        if file.filename:
            filename = secure_filename(file.filename)
            
            # Save locally first
            local_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(local_path)
            
            # Try uploading to Cloudinary
            try:
                result = cloudinary.uploader.upload(
                    local_path,
                    folder=current_folder,
                    resource_type="auto"
                )
                url = result['secure_url']
                public_id = result['public_id']
                file_size = result.get('bytes', os.path.getsize(local_path))
            except Exception as e:
                # Fallback to local storage
                print(f"Cloudinary upload failed: {e}")
                url = f'/static/uploads/{filename}'
                public_id = f"local_{datetime.now().timestamp()}"
                file_size = os.path.getsize(local_path)
            
            file_info = {
                'name': filename,
                'url': url,
                'public_id': public_id,
                'format': Path(filename).suffix[1:] if Path(filename).suffix else 'unknown',
                'bytes': file_size,
                'folder': current_folder,
                'date': datetime.now().isoformat(),
                'type': 'file'
            }
            
            metadata['files'].insert(0, file_info)
            uploaded_list.append(file_info)
    
    save_metadata(metadata)
    return jsonify({
        'success': True,
        'message': f'Successfully uploaded {len(uploaded_list)} file(s)',
        'files': uploaded_list
    })

@app.route('/api/create-file', methods=['POST'])
@login_required
def create_file():
    """Create a new text file"""
    data = request.json
    filename = data.get('name', '').strip()
    content = data.get('content', '')
    current_folder = data.get('folder', '')
    
    if not filename:
        return jsonify({'error': 'Filename is required'}), 400
    
    # Add .txt extension if no extension
    if not '.' in filename:
        filename += '.txt'
    
    filename = secure_filename(filename)
    
    # Save locally
    local_path = os.path.join(UPLOAD_FOLDER, filename)
    with open(local_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    # Try Cloudinary upload
    try:
        result = cloudinary.uploader.upload(
            local_path,
            folder=current_folder,
            resource_type="raw"
        )
        url = result['secure_url']
        public_id = result['public_id']
        file_size = result.get('bytes', os.path.getsize(local_path))
    except:
        url = f'/static/uploads/{filename}'
        public_id = f"local_{datetime.now().timestamp()}"
        file_size = os.path.getsize(local_path)
    
    file_info = {
        'name': filename,
        'url': url,
        'public_id': public_id,
        'format': 'txt',
        'bytes': file_size,
        'folder': current_folder,
        'date': datetime.now().isoformat(),
        'type': 'file'
    }
    
    metadata = load_metadata()
    metadata['files'].insert(0, file_info)
    save_metadata(metadata)
    
    return jsonify({
        'success': True,
        'message': 'File created successfully',
        'file': file_info
    })

@app.route('/api/create-folder', methods=['POST'])
@login_required
def create_folder():
    """Create a new folder"""
    data = request.json
    folder_name = data.get('name', '').strip()
    current_folder = data.get('folder', '')
    
    if not folder_name:
        return jsonify({'error': 'Folder name is required'}), 400
    
    folder_path = f"{current_folder}/{folder_name}" if current_folder else folder_name
    
    # Create physical directory
    physical_path = os.path.join(UPLOAD_FOLDER, folder_path)
    os.makedirs(physical_path, exist_ok=True)
    
    folder_info = {
        'name': f"{folder_name}/",
        'url': '',
        'public_id': f"folder_{datetime.now().timestamp()}",
        'format': 'folder',
        'bytes': 0,
        'folder': folder_path,
        'date': datetime.now().isoformat(),
        'type': 'folder'
    }
    
    metadata = load_metadata()
    metadata['files'].insert(0, folder_info)
    save_metadata(metadata)
    
    return jsonify({
        'success': True,
        'message': 'Folder created successfully',
        'folder': folder_info
    })

@app.route('/api/delete/<public_id>', methods=['DELETE'])
@login_required
def delete_file(public_id):
    """Delete a file or folder"""
    metadata = load_metadata()
    files = metadata.get('files', [])
    
    file_to_delete = None
    for file in files:
        if file.get('public_id') == public_id:
            file_to_delete = file
            break
    
    if not file_to_delete:
        return jsonify({'error': 'File not found'}), 404
    
    # Delete from Cloudinary if exists
    if public_id and not public_id.startswith('local_') and not public_id.startswith('folder_'):
        try:
            cloudinary.uploader.destroy(public_id)
        except:
            pass
    
    # Delete local file
    local_path = os.path.join(UPLOAD_FOLDER, file_to_delete.get('name', ''))
    if os.path.exists(local_path):
        if os.path.isdir(local_path):
            shutil.rmtree(local_path)
        else:
            os.remove(local_path)
    
    # Remove from metadata
    metadata['files'] = [f for f in files if f.get('public_id') != public_id]
    
    # Remove files in folder if deleting a folder
    if file_to_delete.get('type') == 'folder':
        folder_path = file_to_delete.get('folder', '')
        metadata['files'] = [f for f in metadata['files'] if not f.get('folder', '').startswith(folder_path)]
    
    save_metadata(metadata)
    
    return jsonify({
        'success': True,
        'message': 'Deleted successfully'
    })

@app.route('/api/share/<public_id>', methods=['GET'])
@login_required
def get_share_link(public_id):
    """Get share link for a file"""
    metadata = load_metadata()
    
    for file in metadata.get('files', []):
        if file.get('public_id') == public_id:
            return jsonify({
                'url': file.get('url'),
                'name': file.get('name')
            })
    
    return jsonify({'error': 'File not found'}), 404

@app.route('/api/gallery', methods=['GET'])
def get_gallery():
    """Get images for gallery display"""
    metadata = load_metadata()
    
    # Get only image files
    images = [f for f in metadata.get('files', []) if is_image(f.get('name', ''))]
    
    # Sort by date, most recent first
    images.sort(key=lambda x: x.get('date', ''), reverse=True)
    
    # Add computed fields
    for img in images:
        img['size_display'] = format_size(img.get('bytes', 0))
        img['date_display'] = format_date(img.get('date', ''))
    
    return jsonify({'images': images[:12]})  # Return latest 12 images

@app.route('/static/uploads/<path:filename>')
def serve_upload(filename):
    """Serve uploaded files"""
    return send_file(os.path.join(UPLOAD_FOLDER, filename))

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
