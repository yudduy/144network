import sys
import json
from collections import defaultdict
from threading import Lock

# Shared state that server.py will read
topology = {
    'nodes': {},
    'edges': defaultdict(lambda: {'count': 0, 'last_active': 0})
}
topology_lock = Lock()

def parse_debug_line(line):
    if not line.startswith("DEBUG:"):
        return None
    
    # Parse: "DEBUG: dst=... src=... type=IPv4 IPv4: 80.6.5.4 -> 50.9.8.7"
    import re
    match = re.search(r'IPv4: (\d+\.\d+\.\d+\.\d+) -> (\d+\.\d+\.\d+\.\d+)', line)
    if match:
        return {
            'src_ip': match.group(1),
            'dst_ip': match.group(2),
            'timestamp': time.time()
        }
    return None

def aggregate_packet(packet):
    with topology_lock:
        src, dst = packet['src_ip'], packet['dst_ip']
        now = time.time()
        
        # Update nodes
        for ip in [src, dst]:
            if ip not in topology['nodes']:
                topology['nodes'][ip] = {'first_seen': now, 'last_seen': now, 'count': 0}
            topology['nodes'][ip]['last_seen'] = now
            topology['nodes'][ip]['count'] += 1
        
        # Update edge
        edge_key = (src, dst)
        topology['edges'][edge_key]['count'] += 1
        topology['edges'][edge_key]['last_active'] = now

# Read from stdin (piped from router)
for line in sys.stdin:
    packet = parse_debug_line(line.strip())
    if packet:
        aggregate_packet(packet)