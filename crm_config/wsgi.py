"""
WSGI config for crm_config project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os
import sys

# Path to your project folder where manage.py is located
path = '/home/yourusername/your-repo-name'
if path not in sys.path:
    sys.path.append(path)

# Name of the folder containing settings.py
os.environ['DJANGO_SETTINGS_MODULE'] = 'your_project_name.settings'

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
