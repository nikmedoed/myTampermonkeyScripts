import os
import sys
from rapidfuzz import fuzz, process

def create_playlist(directory_path):
    # Поиск текстового файла в директории
    text_file_path = next((f for f in os.listdir(directory_path) if f.endswith('.txt')), None)
    if text_file_path is None:
        print("Текстовый файл не найден.")
        return
    text_file_path = os.path.join(directory_path, text_file_path)
    print(f'Текстовый файл найден: {text_file_path}')

    # Получение списка файлов mp3
    mp3_files = set([f for f in os.listdir(directory_path) if f.endswith('.mp3')])
    print(f'Найдено {len(mp3_files)} файлов mp3.')

    # Чтение названий треков из текстового файла
    with open(text_file_path, 'r', encoding='utf-8') as file:
        track_names = [line.strip() for line in file]

    # Сопоставление названий треков с файлами mp3
    playlist_tracks = []
    for track_name in track_names:
        result = process.extractOne(track_name, mp3_files, scorer=fuzz.token_sort_ratio)
        if result:
            best_match, score, index = result
            if score > 45:
                # playlist_tracks.append(os.path.join(directory_path, best_match))
                if score < 50:
                    print(f"{score}\n\t{best_match}\n\t{track_name}")
                playlist_tracks.append(best_match)
                mp3_files.remove(best_match)
                continue
        print(f"Не удалось найти соответствие для\n\t{track_name}\n\t{result}")

    # Формирование пути к файлу плейлиста
    playlist_file_path = os.path.join(directory_path, os.path.basename(text_file_path).replace('.txt', '.m3u'))

    # Запись плейлиста в файл
    with open(playlist_file_path, 'w', encoding='utf-8') as file:
        file.write('#EXTM3U\n')
        for track_path in playlist_tracks:
            file.write(track_path + '\n')

    print(f'Плейлист сохранен в {playlist_file_path}')

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Использование: python create_playlist.py <путь к директории>")
    else:
        directory_path = sys.argv[1]
        create_playlist(directory_path)
