import os

# Конфигурация
OUTPUT_FILE = ".meta/project-war-hearts-full.txt"
EXCLUDE_DIRS = {'.git', '.github', '.meta', 'node_modules', 'assets'}
EXTENSIONS = {'.js', '.css', '.html', '.json', '.yml'}

def generate_context():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out:
        out.write(f"PROJECT: vi3na1bita_war_hearts\n")
        out.write("=" * 30 + "\n\n")
        
        for root, dirs, files in os.walk(project_root):
            # Пропускаем ненужные папки
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            
            for file in files:
                if any(file.endswith(ext) for ext in EXTENSIONS):
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, project_root)
                    
                    out.write(f"-> ФАЙЛ: {rel_path}\n")
                    out.write("-" * 30 + "\n")
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            out.write(f.read())
                    except Exception as e:
                        out.write(f"[Error reading file: {e}]")
                    out.write("\n\n")

if __name__ == "__main__":
    generate_context()
    print(f"Контекст успешно сгенерирован в {OUTPUT_FILE}")
