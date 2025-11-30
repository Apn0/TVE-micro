from prometheus_client import Counter, Enum

API_VALIDATION_ERRORS_TOTAL = Counter(
    'api_validation_errors_total',
    'Total number of API validation errors'
)

SYSTEM_STATE = Enum(
    'system_state_enum',
    'Current system state',
    states=['READY', 'STARTING', 'RUNNING', 'STOPPING', 'ALARM']
)

LOGGER_WRITE_FAILURES_TOTAL = Counter(
    'logger_write_failures_total',
    'Total number of data logger write failures'
)
