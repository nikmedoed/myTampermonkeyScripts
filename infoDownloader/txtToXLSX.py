import pandas as pd
import os
import glob
import sys

def create_excel_from_txt_files(directory):
    files_pattern = os.path.join(directory, '*.txt')
    files = glob.glob(files_pattern)

    data = []

    for file_name in files:
        with open(file_name, 'r', encoding='utf-8') as file:
            lines = file.read().splitlines()
            lines += [''] * (3 - len(lines))
            data.append(lines)

    df = pd.DataFrame(data, columns=['Название', 'Год', 'URL'])

    output_file = os.path.join(directory, 'MoviesAndSeries.xlsx')
    df.to_excel(output_file, index=False)

    return output_file

# Если путь не предоставлен в аргументах, используется текущая рабочая директория
directory_path = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
output = create_excel_from_txt_files(directory_path)
print(f'The Excel file has been created: {output}')
