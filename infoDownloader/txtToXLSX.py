import pandas as pd
import os
import glob
import sys


def create_excel_from_txt_files(directory):
    files_pattern = os.path.join(directory, '*.txt')
    files = glob.glob(files_pattern)

    data = []
    max_columns = 0

    for file_name in files:
        with open(file_name, 'r', encoding='utf-8') as file:
            lines = file.read().splitlines()
            max_columns = max(max_columns, len(lines))  # Определяем максимальное количество колонок
            data.append(lines)

    # Выравниваем строки по максимальному количеству столбцов
    for i in range(len(data)):
        data[i] += [''] * (max_columns - len(data[i]))

    # Генерируем названия колонок динамически
    column_names = [f'Column {i + 1}' for i in range(max_columns)]

    df = pd.DataFrame(data, columns=column_names)
    output_file = os.path.join(directory, 'MoviesAndSeries.xlsx')
    df.to_excel(output_file, index=False)

    return output_file


# Если путь не предоставлен в аргументах, используется текущая рабочая директория
directory_path = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
output = create_excel_from_txt_files(directory_path)
print(f'The Excel file has been created: {output}')
