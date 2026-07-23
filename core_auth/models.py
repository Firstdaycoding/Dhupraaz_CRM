from datetime import date
from gettext import translation
from sqlite3 import Time

from django.db import models
from django.contrib.auth.models import User
from django.db import models, transaction
from django.conf import settings

class Quotation(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('won', 'Won'),
        ('lost', 'Lost')
    ]
    PROJECT_TYPE_CHOICES = [
        ('on-grid', 'On-Grid'),
        ('off-grid', 'Off-Grid'),
        ('hybrid', 'Hybrid')
    ]
    Quote_id = models.AutoField(primary_key=True)
    Quotation_date = models.DateField(default= date.today())
    Valid_till = models.DateField(blank=True, null=True)

    customer_name = models.CharField(max_length=200, blank=True)
    customer_phone = models.CharField(max_length=30, blank=True)
    customer_ca_number = models.CharField(max_length=50, blank=True)
    customer_address = models.TextField(blank=True)

    project_type = models.CharField(max_length=100, blank=True, choices=PROJECT_TYPE_CHOICES)
    project_size = models.CharField(max_length=100, blank=True)

    items = models.JSONField(default=list)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gst_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    source_lead = models.ForeignKey(
    'Lead',
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name="quotations"
    )

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)

        if is_new and self.source_lead_id:
            # Local import avoids a circular import between Lead and Quotation
            lead = self.source_lead
            # Don't downgrade a lead that's already Won/Lost — those are terminal
            # states and shouldn't flip back to 'quoted' just because a second
            # quotation gets generated against the same lead later.
            if lead.status not in (Lead.STATUS_WON, Lead.STATUS_LOST):
                old_status_display = lead.get_status_display()
                lead.status = Lead.STATUS_QUOTED
                lead.save(update_fields=['status', 'updated_at'])

                LeadNote.objects.create(
                    lead=lead,
                    note=f"Status changed from '{old_status_display}' to 'Quoted' — Quotation {self.Quote_id} was generated.",
                    note_type=LeadNote.TYPE_STATUS_CHANGE,
                )

class SystemBOM(models.Model):
    SYSTEM_TYPE_CHOICES = [
        ('on-grid', 'On-Grid'),
        ('hybrid', 'Hybrid'),
        ('off-grid', 'Off-Grid'),
    ]
    id = models.BigAutoField(primary_key=True)
    package_name = models.CharField(max_length=255)
    system_type = models.CharField(max_length=20, choices=SYSTEM_TYPE_CHOICES, default='on-grid')
    system_size_kw = models.DecimalField(max_digits=10, decimal_places=2)
    
    items = models.JSONField(default=list)
    
    # Automatic timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    base_cost = models.DecimalField(max_digits=12, decimal_places=2, editable=False, default=0)
    profit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, editable=False, default=0)

    def calculate_totals(self):
        self.base_cost = sum(
            float(item.get("unit_price", 0)) * float(item.get("quantity", 0))
            for item in self.items
        )

        self.grand_total = self.base_cost + self.profit_amount

class Invoice(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('finalized', 'Finalized'),
    ]
    PAYMENT_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('partially_paid', 'Partially Paid'),
        ('paid', 'Paid'),
    ]
    PROJECT_TYPE_CHOICES = [
        ('on-grid', 'On-Grid'),
        ('off-grid', 'Off-Grid'),
        ('hybrid', 'Hybrid'),
    ]

    Invoice_id = models.CharField(max_length=30, unique=True, blank=True, null=True)
 
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')
 
    source_quotation = models.ForeignKey(
        'Quotation',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices',
    )
    Invoice_date = models.DateField(null=True, blank=True)

    customer_name = models.CharField(max_length=200, blank=True)
    customer_phone = models.CharField(max_length=30, blank=True)
    customer_ca_number = models.CharField(max_length=50, blank=True)
    customer_address = models.TextField(blank=True)

    project_type = models.CharField(max_length=20, choices=PROJECT_TYPE_CHOICES, blank=True)
    project_size = models.CharField(max_length=50, blank=True)

    items = models.JSONField(default=list)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gst_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.Invoice_id or f"Invoice #{self.pk} (unsaved number)"

    @property
    def balance_due(self):
        return self.grand_total - self.amount_paid

class Payment(models.Model):
    METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('bank_transfer', 'Bank Transfer / NEFT / RTGS'),
        ('upi', 'UPI'),
        ('cheque', 'Cheque'),
        ('other', 'Other'),
    ]
    invoice = models.ForeignKey(
        'Invoice',
        on_delete=models.CASCADE,
        related_name='payments',
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='cash')
    reference_no = models.CharField(max_length=100, blank=True)  # UTR / cheque no / UPI txn id
    paid_on = models.DateField()
    notes = models.TextField(blank=True)

    is_voided = models.BooleanField(default=False)
    voided_reason = models.CharField(max_length=200, blank=True)
 
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
 
    class Meta:
        ordering = ['-paid_on', '-created_at']
 
    def __str__(self):
        return f"₹{self.amount} on {self.paid_on} for {self.invoice.Invoice_id}"

class Lead(models.Model):

    STATUS_NEW = 'new'
    STATUS_LOST = 'lost'
    STATUS_WON= 'won'
    STATUS_QUOTED= 'quoted'
    STATUS_CONTACTED = 'contacted'
    STATUS_VISIT = 'site_visit_scheduled'
    STATUS_VISITED= 'site_visit_done'

    STATUS_CHOICES = [
        ('new', 'New'),
        ('contacted', 'Contacted'),
        ('site_visit_scheduled', 'Site Visit Scheduled'),
        ('site_visit_done', 'Site Visit Done'),
        ('quoted', 'Quoted'),
        ('won', 'Won'),
        ('lost', 'Lost'),
    ]

    LOST_REASON_CHOICES = [
        ('price', 'Price too high'),
        ('competitor', 'Went with a competitor'),
        ('not_ready', 'Not ready yet'),
        ('no_response', 'Stopped responding'),
        ('other', 'Other'),
    ]

    REFERRAL_SOURCE_CHOICES = [
        ('existing_customer', 'Existing Customer'),
        ('employee', 'Employee'),
        ('vendor_dealer', 'Vendor / Dealer'),
        ('walk_in', 'Walk-in'),
        ('online_ad', 'Online / Ad'),
        ('other', 'Other'),
        ('website', 'Website')
    ]

    referral_source_type = models.CharField(
        max_length=20, choices=REFERRAL_SOURCE_CHOICES, blank=True
    )
    referral_name = models.CharField(
        max_length=200, blank=True,
        help_text="Name of the person/entity who referred this lead"
    )

    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=30)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)

    PROJECT_TYPE_CHOICES = [
        ('on-grid', 'On-Grid'),
        ('off-grid', 'Off-Grid'),
        ('hybrid', 'Hybrid'),
    ]
    project_type = models.CharField(max_length=20, choices=PROJECT_TYPE_CHOICES, blank=True)
    estimated_system_size = models.CharField(max_length=50, blank=True)
    estimated_budget = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    status = models.CharField(max_length=25, choices=STATUS_CHOICES, default='new')
    lost_reason = models.CharField(max_length=20, choices=LOST_REASON_CHOICES, blank=True)
    lost_reason_notes = models.TextField(blank=True)

    next_follow_up_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"

    @property
    def is_open(self):
        return self.status not in ('won', 'lost')

class LeadNote(models.Model):
 
    TYPE_GENERAL = 'general'
    TYPE_CALL = 'call'
    TYPE_MEETING = 'meeting'
    TYPE_SITE_VISIT = 'site_visit'
    TYPE_STATUS_CHANGE = 'status_change'
 
    NOTE_TYPE_CHOICES = [
        ('general', 'General Note'),
        ('call', 'Call Log'),
        ('meeting', 'Meeting Outcome'),
        ('site_visit', 'Site Visit Outcome'),
        ('status_change', 'Status Change'),
    ]
 
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name='notes')
    note = models.TextField()
    note_type = models.CharField(max_length=20, choices=NOTE_TYPE_CHOICES, default=TYPE_GENERAL)  # NEW
 
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
 
    class Meta:
        ordering = ['-created_at']
 
    def __str__(self):
        return f"Note on {self.lead.name} @ {self.created_at:%Y-%m-%d %H:%M}"
    
def recompute_invoice_payment_state(invoice_id): 
    with transaction.atomic():
        invoice = Invoice.objects.select_for_update().get(pk=invoice_id)
 
        total_paid = invoice.payments.filter(is_voided=False).aggregate(
            total=models.Sum('amount')
        )['total'] or 0
 
        invoice.amount_paid = total_paid
 
        if total_paid <= 0:
            invoice.payment_status = 'pending'
        elif total_paid >= invoice.grand_total:
            invoice.payment_status = 'paid'
        else:
            invoice.payment_status = 'partially_paid'
 
        invoice.save(update_fields=['amount_paid', 'payment_status'])
        return invoice
    
