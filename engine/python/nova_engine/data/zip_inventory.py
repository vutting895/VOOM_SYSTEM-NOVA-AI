"""Safe inventory helper for locally downloaded data ZIP archives.

Lists archive members without extracting files. Rejects path traversal members.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile, ZipFile


@dataclass(frozen=True, slots=True)
class ZipMember:
    name: str
    size_bytes: int
    compressed_size_bytes: int
    is_directory: bool


def inspect_zip(path: Path) -> list[ZipMember]:
    try:
        with ZipFile(path) as archive:
            output = []
            for item in archive.infolist():
                member = PurePosixPath(item.filename)
                if member.is_absolute() or ".." in member.parts:
                    raise ValueError(f"Unsafe archive member path: {item.filename}")
                output.append(ZipMember(
                    name=item.filename,
                    size_bytes=item.file_size,
                    compressed_size_bytes=item.compress_size,
                    is_directory=item.is_dir(),
                ))
            return output
    except BadZipFile as exc:
        raise ValueError(f"Invalid ZIP archive: {path}") from exc
