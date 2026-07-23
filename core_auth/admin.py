from django.contrib import admin
from .models import SystemBOM, Quotation, Invoice, Lead, LeadNote, Payment

admin.site.register(SystemBOM)
admin.site.register(Quotation)
admin.site.register(Invoice)
admin.site.register(LeadNote)
admin.site.register(Lead)
admin.site.register(Payment)
# Register your models here.