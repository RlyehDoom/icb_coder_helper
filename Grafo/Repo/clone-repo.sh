#!/bin/bash

# Universal Git Repository Cloner (Azure DevOps & GitHub)
# Usage: ./clone-repo.sh [OPTIONS]
# 
# Options:
#   -u, --url           Repository URL (required) - supports Azure DevOps & GitHub
#   -n, --name          Repository name (optional, extracted from URL if not provided)
#   -f, --folder        Custom folder name for cloning (optional, uses repo name if not provided)
#   -s, --sparse        Comma-separated list of folders for sparse checkout (optional)
#   -b, --branch        Branch to clone (default: main)
#   -t, --token         Personal Access Token for authentication (optional)
#   -h, --help          Show this help message

set -e

# Default values
BRANCH="main"
REPO_NAME=""
FOLDER_NAME=""
SPARSE_FOLDERS=""
REPO_URL=""
PAT_TOKEN=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_BASE_DIR="${SCRIPT_DIR}/Cloned"

# Load .env file if it exists (for default values)
ENV_FILE="${SCRIPT_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
    echo "Loading configuration from .env file..."
    set -a  # Automatically export all variables
    source "$ENV_FILE"
    set +a  # Stop auto-exporting
    
    # Use .env values as defaults if they exist
    BRANCH="${GRAFO_DEFAULT_BRANCH:-$BRANCH}"
    SPARSE_FOLDERS="${GRAFO_DEFAULT_SPARSE:-$SPARSE_FOLDERS}"
    
    # Try Azure DevOps token first, then GitHub token
    if [ -n "${AZURE_DEVOPS_PAT}" ]; then
        PAT_TOKEN="${AZURE_DEVOPS_PAT}"
    elif [ -n "${GITHUB_TOKEN}" ]; then
        PAT_TOKEN="${GITHUB_TOKEN}"
    fi
    
    echo "✓ Configuration loaded from .env"
fi

# Function to show usage
show_help() {
    cat << EOF
Universal Git Repository Cloner (Azure DevOps & GitHub)

Usage: $0 [OPTIONS]

Options:
    -u, --url URL          Repository URL (required) - supports Azure DevOps & GitHub
    -n, --name NAME        Repository name (optional, extracted from URL if not provided)
    -f, --folder FOLDER    Custom folder name for cloning (optional, uses repo name if not provided)
    -s, --sparse FOLDERS   Comma-separated list of folders for sparse checkout (optional)
    -b, --branch BRANCH    Branch to clone (default: main)
    -t, --token TOKEN      Personal Access Token for authentication (optional)
    -h, --help             Show this help message

Examples:
    # Azure DevOps
    $0 -u https://dev.azure.com/org/project/_git/repo
    $0 -u https://org.visualstudio.com/project/_git/repo -b develop
    
    # GitHub  
    $0 -u https://github.com/owner/repo.git
    $0 -u git@github.com:owner/repo.git -s "src,docs"
    
    # With authentication and options
    $0 -u https://dev.azure.com/org/project/_git/repo -t \$AZURE_PAT -s "src,docs"
    $0 -u https://github.com/owner/private-repo.git -t \$GITHUB_TOKEN -f CustomName

Environment Variables & .env file:
    AZURE_DEVOPS_PAT          Azure DevOps Personal Access Token
    GITHUB_TOKEN              GitHub Personal Access Token  
    GRAFO_DEFAULT_BRANCH      Default branch to clone (alternative to -b option)  
    GRAFO_DEFAULT_SPARSE      Default sparse checkout folders (alternative to -s option)
    
    Create a .env file in the same directory as this script with your default values:
        AZURE_DEVOPS_PAT="your-azure-token-here"
        GITHUB_TOKEN="your-github-token-here"
        GRAFO_DEFAULT_BRANCH="develop"
        GRAFO_DEFAULT_SPARSE="src,docs,configs"

EOF
}

# Function to detect repository platform
detect_platform() {
    local url="$1"
    if [[ "$url" =~ ^https?://[^/]*github\.com ]] || [[ "$url" =~ ^git@github\.com ]]; then
        echo "github"
    elif [[ "$url" =~ ^https?://[^/]*azure\.com ]] || [[ "$url" =~ ^https?://.*\.visualstudio\.com ]] || [[ "$url" =~ /_git/ ]]; then
        echo "azure"
    else
        echo "unknown"
    fi
}

# Function to extract repository name from URL
extract_repo_name() {
    local url="$1"
    local platform=$(detect_platform "$url")
    
    case "$platform" in
        "github")
            # GitHub patterns:
            # https://github.com/owner/repo.git
            # git@github.com:owner/repo.git
            if [[ "$url" =~ github\.com[:/]([^/]+)/([^/]+)(\.git)?/?$ ]]; then
                echo "${BASH_REMATCH[2]}"
            else
                echo "$(basename "$url" .git)"
            fi
            ;;
        "azure")
            # Azure DevOps patterns:
            # https://dev.azure.com/organization/project/_git/repository
            # https://organization.visualstudio.com/project/_git/repository
            if [[ "$url" =~ /_git/([^/]+)/?$ ]]; then
                echo "${BASH_REMATCH[1]}"
            else
                echo "$(basename "$url" .git)"
            fi
            ;;
        *)
            # Generic fallback
            echo "$(basename "$url" .git)"
            ;;
    esac
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--url)
            REPO_URL="$2"
            shift 2
            ;;
        -n|--name)
            REPO_NAME="$2"
            shift 2
            ;;
        -f|--folder)
            FOLDER_NAME="$2"
            shift 2
            ;;
        -s|--sparse)
            SPARSE_FOLDERS="$2"
            shift 2
            ;;
        -b|--branch)
            BRANCH="$2"
            shift 2
            ;;
        -t|--token)
            PAT_TOKEN="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$REPO_URL" ]]; then
    echo "Error: Repository URL is required"
    show_help
    exit 1
fi

# Extract repository name if not provided
if [[ -z "$REPO_NAME" ]]; then
    REPO_NAME=$(extract_repo_name "$REPO_URL")
fi

# Use custom folder name if provided, otherwise use repository name
if [[ -z "$FOLDER_NAME" ]]; then
    FOLDER_NAME="$REPO_NAME"
fi

# Use environment variable for PAT if not provided via command line
if [[ -z "$PAT_TOKEN" && -n "$AZURE_DEVOPS_PAT" ]]; then
    PAT_TOKEN="$AZURE_DEVOPS_PAT"
fi

# Create Repo directory if it doesn't exist
mkdir -p "$REPO_BASE_DIR"

# Target directory for the repository
TARGET_DIR="${REPO_BASE_DIR}/${FOLDER_NAME}"

# Check if repository already exists
if [[ -d "$TARGET_DIR" ]]; then
    echo "⚠️  Directory '$FOLDER_NAME' already exists at: $TARGET_DIR"
    
    # Check if it's a git repository
    if [[ -d "$TARGET_DIR/.git" ]]; then
        cd "$TARGET_DIR"
        CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
        CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
        
        echo "📂 Current repository info:"
        echo "   Remote: $CURRENT_REMOTE"
        echo "   Branch: $CURRENT_BRANCH"
        echo "   Target: $REPO_URL (branch: $BRANCH)"
        echo
        
        echo "Choose an option:"
        echo "  [1] Pull latest changes from current branch"
        echo "  [2] Reset hard and pull from target branch"
        echo "  [3] Cancel operation"
        echo "  [4] Delete and re-clone"
        
        read -p "Enter your choice (1-4): " -n 1 -r
        echo
        echo
        
        case $REPLY in
            1)
                echo "🔄 Pulling latest changes..."
                git pull
                echo "✅ Repository updated successfully"
                exit 0
                ;;
            2)
                echo "🔄 Resetting and switching to branch '$BRANCH'..."
                git fetch origin
                git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
                git reset --hard "origin/$BRANCH"
                echo "✅ Repository reset and updated successfully"
                exit 0
                ;;
            3)
                echo "❌ Operation cancelled"
                exit 0
                ;;
            4)
                echo "🗑️  Deleting existing directory..."
                cd ..
                rm -rf "$TARGET_DIR"
                echo "Directory deleted. Proceeding with fresh clone..."
                ;;
            *)
                echo "❌ Invalid option. Operation cancelled"
                exit 1
                ;;
        esac
    else
        echo "⚠️  Directory exists but is not a git repository"
        read -p "Delete and proceed with clone? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$TARGET_DIR"
            echo "Directory deleted. Proceeding with clone..."
        else
            echo "❌ Operation cancelled"
            exit 0
        fi
    fi
fi

# Prepare clone URL with authentication if PAT is provided
CLONE_URL="$REPO_URL"
if [[ -n "$PAT_TOKEN" ]]; then
    # Insert PAT token into URL for authentication
    if [[ $REPO_URL =~ https://(.+) ]]; then
        CLONE_URL="https://:${PAT_TOKEN}@${BASH_REMATCH[1]}"
    fi
fi

# Check if sparse checkout is requested
if [[ -n "$SPARSE_FOLDERS" ]]; then
    echo "🚀 Cloning repository with sparse checkout..."
    echo "   Repository: $REPO_NAME"
    echo "   From: $REPO_URL"
    echo "   To: $TARGET_DIR"
    echo "   Branch: $BRANCH"
    echo "   Sparse folders: $SPARSE_FOLDERS"
    echo
    
    # Clone with sparse checkout
    git clone --filter=blob:none --branch "$BRANCH" --single-branch "$CLONE_URL" "$TARGET_DIR"
    
    cd "$TARGET_DIR"
    
    # Enable sparse checkout with non-cone mode for precise control
    git config core.sparseCheckout true
    git config core.sparseCheckoutCone false
    
    # Create sparse-checkout file with specified folders
    echo "Setting up sparse checkout..."
    SPARSE_FILE=".git/info/sparse-checkout"
    
    # Convert comma-separated folders to newline-separated with precise patterns
    IFS=',' read -ra FOLDERS <<< "$SPARSE_FOLDERS"
    for folder in "${FOLDERS[@]}"; do
        # Trim whitespace
        folder=$(echo "$folder" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

        # Remove leading slash if present (Windows Node.js may already remove it)
        folder=$(echo "$folder" | sed 's/^\/*//')

        # Add leading slash back for git sparse-checkout pattern
        # Git sparse-checkout requires paths to start with /
        echo "/$folder" >> "$SPARSE_FILE"
        echo "/$folder/*" >> "$SPARSE_FILE"
        echo "   ✓ Added: /$folder (with contents)"
    done
    
    # Apply sparse checkout
    echo "Applying sparse checkout..."
    git read-tree -m -u HEAD
    
    echo "✅ Repository '$REPO_NAME' cloned successfully with sparse checkout to: $TARGET_DIR"
    echo "📁 Folder name: $FOLDER_NAME"
    echo "📂 Sparse folders: $SPARSE_FOLDERS"
else
    echo "🚀 Cloning repository..."
    echo "   Repository: $REPO_NAME"
    echo "   From: $REPO_URL"
    echo "   To: $TARGET_DIR"
    echo "   Branch: $BRANCH"
    echo
    
    # Clone the repository normally
    git clone --branch "$BRANCH" --single-branch "$CLONE_URL" "$TARGET_DIR"
    
    echo "✅ Repository '$REPO_NAME' cloned successfully to: $TARGET_DIR"
    echo "📁 Folder name: $FOLDER_NAME"
fi
