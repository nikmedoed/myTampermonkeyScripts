import os
import glob
import sys
from openpyxl import Workbook

def create_excel_from_txt_files(directory):
    # Ищем все .txt-файлы в каталоге
    pattern = os.path.join(directory, '*.txt')
    files = glob.glob(pattern)

    data = []
    max_columns = 0

    # Читаем строки из каждого файла
    for file_path in files:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.read().splitlines()
        data.append(lines)
        if len(lines) > max_columns:
            max_columns = len(lines)

    # Добиваем до равной длины
    for row in data:
        row.extend([''] * (max_columns - len(row)))

    # Создаём книгу и лист
    wb = Workbook()
    ws = wb.active

    # Заголовки колонок
    headers = [f'Column {i + 1}' for i in range(max_columns)]
    ws.append(headers)

    # Записываем данные
    for row in data:
        ws.append(row)

    # Сохраняем файл
    output_file = os.path.join(directory, 'MoviesAndSeries.xlsx')
    wb.save(output_file)
    return output_file

if __name__ == '__main__':
    # Путь можно передать аргументом, иначе — текущий каталог
    directory = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    result = create_excel_from_txt_files(directory)
    print(f'The Excel file has been created: {result}')
