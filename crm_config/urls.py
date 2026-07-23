from django.contrib import admin
from django.urls import path
from core_auth import views
from core_auth.views import dashboard_view
from django.contrib.auth import views as auth_views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('dashboard/', dashboard_view, name='dashboard'),

    path('login/', auth_views.LoginView.as_view(template_name='login.html'), name='login'),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),

    path("generate_quotation/", views.generate_quotation_view, name="generate_quotation"),
    path("view_quote/<int:quote_id>/", views.view_quote_view, name="view_quote"),
    path("edit_quote/<int:quote_id>/", views.edit_quote_view, name="edit_quote"),
    path("update_quote_status/<int:quote_id>/", views.update_quote_status, name="update_status"),

    path("create_bom/", views.create_bom, name="create_bom"),
    path("edit_bom/<int:bom_id>", views.edit_bom, name="edit_bom"),
    path('boms/search/', views.search_bom_api, name='search_bom_api'),

    path("generate_invoice/", views.generate_invoice, name="generate_invoice"),
    path("view_invoice/<str:inv_id>/", views.view_invoice, name="view_invoice"),
    path("edit_invoice/<str:inv_id>/", views.edit_invoice, name="edit_invoice"),
    path('finalize_invoice/<str:inv_id>/', views.finalize_invoice, name='finalize_invoice'),

    path("invoice/<str:invoice_id>/payments/", views.invoice_payments_list, name="invoice_payments_list"),
    path("invoice/<str:invoice_id>/payments/add/", views.add_payment, name="add_payment"),
    path("payments/<int:payment_id>/void/", views.void_payment, name="void_payment"),

    path("leads/create/", views.create_lead, name="create_lead"),
    path('lead_details/<int:lead_id>', views.lead_detail, name="lead_detail"),
    path("leads/<int:lead_id>/", views.lead_detail, name="lead_detail"),
    path("leads/<int:lead_id>/update/", views.update_lead, name="update_lead"),
    path("leads/<int:lead_id>/status/", views.update_lead_status, name="update_lead_status"),
    path("leads/<int:lead_id>/followup/", views.update_lead_followup, name="update_lead_followup"),
    path("leads/<int:lead_id>/notes/add/", views.add_lead_note, name="add_lead_note"),
    path("leads/notes/<int:note_id>/delete/", views.delete_lead_note, name="delete_lead_note"),

]
