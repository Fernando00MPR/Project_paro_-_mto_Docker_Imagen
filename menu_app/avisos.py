"""Texto de un aviso (toast) para messages de Django: título y, si hay, detalle en la segunda línea.
showToast (base_menu.html) parte el texto en el salto de línea: título arriba, detalle abajo."""


def aviso(titulo, detalle=''):
    return f'{titulo}\n{detalle}' if detalle else str(titulo)
