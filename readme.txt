Bước 1:
	Job được insert vào DB, song song đó được đưa vào Redis phân Job. 
	Phân 2 loại là jobDefault và jobPriority

Bước 2:
	Worker vào nhận Job. Worker lấy jobPriority trước, nếu không có sẽ lấy jobDefault. 
	Nếu không có dừng lại và trả về job rỗng.
	Nếu có dùng ID nhận được, request vào Redis lấy thông tin tạm thời của Job đang có trên redis.
		Đầu tiên check Job đã được tài khoản của user sử dụng chưa. 
			SETNX jobex:account_id:job_id 1 (trong đó account_id là tài khoản của user, và job_id là id job)
			- Nếu trả về 0 thì trả về 40, job đã được làm.
			- Nếu trả về 1 thì tiếp tục get Job và set expire 24h cho key.
		Bao gồm: jobObject, jobQuantity, jobCountIsRun, get increase jobViewer, get increase jobWorker, jobHidden.
	Nếu jobViewer >= jobQuantity => Trả về 404, không có job.
	Merge các thông tin riêng lẻ vào jobObject và trả về Worker.

Bước 3:
	Worker nhận được Job. Sẽ làm theo 2 phương án: 
		a. Call Api: Hoàn thành job, gọi sang bước 4.1;
		b. Call Api: Không thể hoàn thành job, gọi bước 4.2;

Bước 4:
	Cập nhật hiện trạng cho job.
	4.1: Job đã hoàn thành cập nhật count_is_run +1.
		 Nếu count_is_run >= quantity: Cập nhật message "Thành công", xoá job đó ra khỏi redis phân job 
		 và gọi xoá khỏi DB. Gửi thông tin sang bước 5.
	4.2: Job không hoàn thành cập nhật hidden +1.
		Nếu hidden >= quantity: Cập nhật message "Thất bại", xoá job đó ra khỏi redis phân job 
		 và gọi xoá khỏi DB.

Bước 5:
	Các Job đã đủ điều kiện. Thực hiện quy trình tính tiền.